require "rails_helper"

RSpec.describe "Session" do
  let(:user) { create(:user) }

  describe "GET /api/v1/session" do
    it "未認証でも200で、CSRF tokenを返す" do
      get "/api/v1/session"

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body).to include("authenticated" => false, "csrf_token" => be_present)
      expect(response.headers["Cache-Control"]).to eq("no-store")
      assert_response_schema_confirm(200)
    end

    it "login中は利用者と7日後の期限を返す" do
      freeze_time do
        sign_in_with_password(user)
        get "/api/v1/session"

        expect(response.parsed_body).to include(
          "authenticated" => true,
          "expires_at" => 7.days.from_now.utc.iso8601,
          "account_status" => "active",
          "user" => { "id" => user.id, "email" => user.email, "email_confirmed" => true,
                      "sign_in_methods" => ["password"] }
        )
        assert_response_schema_confirm(200)
      end
    end

    it "login中の利用者がロックされたら、200の未認証として返す" do
      sign_in_with_password(user)
      user.lock_access!(send_instructions: false)

      get "/api/v1/session"

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["authenticated"]).to be(false)
      assert_response_schema_confirm(200)
    end

    it "7日を過ぎたsessionは未認証として扱う" do
      sign_in_with_password(user)
      travel 7.days + 1.second

      get "/api/v1/session"

      expect(response.parsed_body["authenticated"]).to be(false)
    end
  end

  describe "POST /api/v1/session" do
    it "loginするとsessionを更新し、HttpOnly・SameSite=LaxのCookieと新しいCSRF tokenを返す" do
      old_token = csrf_token
      json_request(:post, "/api/v1/session", { email: user.email, password: AuthRequestHelpers::DEFAULT_PASSWORD },
                   token: old_token)

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["csrf_token"]).not_to eq(old_token)
      cookie = response.headers["Set-Cookie"]
      expect(cookie).to include("_focus_on_dot_session=", "httponly", "samesite=lax")
      expect(cookie).not_to match(/domain=/i)
      expect(response.headers["Cache-Control"]).to eq("no-store")
      assert_response_schema_confirm(200)
    end

    it "メールアドレスの大文字小文字と前後の空白を区別しない" do
      json_request(:post, "/api/v1/session",
                   { email: " #{user.email.upcase} ", password: AuthRequestHelpers::DEFAULT_PASSWORD })

      expect(response).to have_http_status(:ok)
    end

    it "passwordが違えば401 invalid_credentials" do
      json_request(:post, "/api/v1/session", { email: user.email, password: "wrong password" })

      expect(response).to have_http_status(:unauthorized)
      expect(problem_code).to eq("invalid_credentials")
      assert_response_schema_confirm(401)
    end

    it "未登録のメールアドレスでも同じ401 invalid_credentials" do
      json_request(:post, "/api/v1/session", { email: "nobody@example.com", password: "whatever password" })

      expect(response).to have_http_status(:unauthorized)
      expect(problem_code).to eq("invalid_credentials")
    end

    it "Google専用の利用者はpasswordでloginできない" do
      google_user = create(:user, :google_only)
      json_request(:post, "/api/v1/session", { email: google_user.email, password: "any password here" })

      expect(problem_code).to eq("invalid_credentials")
    end

    it "メール未確認でpasswordが一致したときだけ403 email_unconfirmed" do
      unconfirmed = create(:user, :unconfirmed)

      json_request(:post, "/api/v1/session",
                   { email: unconfirmed.email, password: AuthRequestHelpers::DEFAULT_PASSWORD })
      expect(response).to have_http_status(:forbidden)
      expect(problem_code).to eq("email_unconfirmed")
      assert_response_schema_confirm(403)

      json_request(:post, "/api/v1/session", { email: unconfirmed.email, password: "wrong password" })
      expect(problem_code).to eq("invalid_credentials")
    end

    it "email・passwordをquery stringからは受け取らない（URLに秘密を載せない）" do
      post "/api/v1/session?#{{ email: user.email, password: AuthRequestHelpers::DEFAULT_PASSWORD }.to_query}",
           headers: { "X-CSRF-Token" => csrf_token }

      expect(response).to have_http_status(:unprocessable_content)
      expect(response.parsed_body["errors"].pluck("field")).to contain_exactly("email", "password")
    end

    it "入力が足りなければ422 validation_failed" do
      json_request(:post, "/api/v1/session", { email: user.email })

      expect(response).to have_http_status(:unprocessable_content)
      expect(response.parsed_body["errors"]).to eq([{ "field" => "password", "code" => "required" }])
      assert_response_schema_confirm(422)
    end

    context "when passwordの不一致が続いた" do
      def fail_login(times)
        token = csrf_token
        times.times do
          json_request(:post, "/api/v1/session", { email: user.email, password: "wrong password" }, token:)
        end
      end

      it "10回でロックし、解除メールを送る。ロック中は正しいpasswordでも401 invalid_credentials" do
        fail_login(10)

        expect(user.reload).to be_access_locked
        expect(last_mail.subject).to include("ロック")
        json_request(:post, "/api/v1/session", { email: user.email, password: AuthRequestHelpers::DEFAULT_PASSWORD })
        expect(problem_code).to eq("invalid_credentials")
      end

      it "ロックは1時間で自動で解ける" do
        fail_login(10)
        travel 1.hour + 1.second

        json_request(:post, "/api/v1/session", { email: user.email, password: AuthRequestHelpers::DEFAULT_PASSWORD })
        expect(response).to have_http_status(:ok)
      end

      it "loginに成功すると失敗の回数を0に戻す" do
        fail_login(9)
        sign_in_with_password(user)

        expect(user.reload.failed_attempts).to eq(0)
      end
    end

    it "失敗がIPごとに1時間50回を超えたら429 rate_limited（未登録のメールアドレスも数える）" do
      token = csrf_token
      50.times do |n|
        json_request(:post, "/api/v1/session", { email: "nobody#{n}@example.com", password: "wrong password" }, token:)
      end

      json_request(:post, "/api/v1/session", { email: user.email, password: AuthRequestHelpers::DEFAULT_PASSWORD },
                   token:)

      expect(response).to have_http_status(:too_many_requests)
      expect(response.parsed_body["retry_after_seconds"]).to be_between(1, 3600)
      assert_response_schema_confirm(429)
    end

    it "CSRF tokenが無ければ403 csrf_invalid" do
      json_request(:post, "/api/v1/session", { email: user.email, password: AuthRequestHelpers::DEFAULT_PASSWORD },
                   token: :none)

      expect(response).to have_http_status(:forbidden)
      expect(problem_code).to eq("csrf_invalid")
      expect(response.headers["Cache-Control"]).to eq("no-store")
      assert_response_schema_confirm(403)
    end

    it "CSRF tokenが別のsessionのものなら403 csrf_invalid" do
      other_token = csrf_token
      reset!

      json_request(:post, "/api/v1/session", { email: user.email, password: AuthRequestHelpers::DEFAULT_PASSWORD },
                   token: other_token)

      expect(problem_code).to eq("csrf_invalid")
    end

    it "許可していないOriginからは403 csrf_invalid" do
      json_request(:post, "/api/v1/session", { email: user.email, password: AuthRequestHelpers::DEFAULT_PASSWORD },
                   headers: { "Origin" => "https://evil.example" })

      expect(problem_code).to eq("csrf_invalid")
    end

    it "CORSの許可headerを返さない" do
      json_request(:post, "/api/v1/session", { email: user.email, password: AuthRequestHelpers::DEFAULT_PASSWORD },
                   headers: { "Origin" => "http://www.example.com" })

      expect(response).to have_http_status(:ok)
      expect(response.headers).not_to include("Access-Control-Allow-Origin")
    end
  end

  describe "DELETE /api/v1/session" do
    it "logoutすると、そのbrowserのsessionは未認証になる。二重のlogoutも204" do
      sign_in_with_password(user)

      json_request(:delete, "/api/v1/session")
      expect(response).to have_http_status(:no_content)
      assert_response_schema_confirm(204)

      get ProtectedProbeRoutes::PATH
      expect(response).to have_http_status(:unauthorized)

      json_request(:delete, "/api/v1/session")
      expect(response).to have_http_status(:no_content)
    end

    it "CSRF tokenが無ければ403 csrf_invalidで、logoutしない" do
      sign_in_with_password(user)

      json_request(:delete, "/api/v1/session", token: :none)
      expect(problem_code).to eq("csrf_invalid")

      get ProtectedProbeRoutes::PATH
      expect(response).to have_http_status(:ok)
    end
  end
end
