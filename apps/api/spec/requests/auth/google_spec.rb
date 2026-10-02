require "rails_helper"

# OmniAuthのtest modeで、Googleへは接続せずに認証結果を差し替える。
RSpec.describe "Google login" do
  let(:google_uid) { "google-uid-1" }

  def mock_google(uid: google_uid, email: "person@example.com", email_verified: true, auth_time: Time.current.to_i)
    OmniAuth.config.mock_auth[:google_oauth2] = OmniAuth::AuthHash.new(
      provider: "google_oauth2", uid:,
      extra: { raw_info: { sub: uid, email:, email_verified: },
               id_info: { sub: uid, email:, auth_time: } }
    )
  end

  # form POSTで開始し、callbackのredirectまで進める。
  def start_google(intent: "sign_in", return_to: nil, token: csrf_token)
    params = { intent:, return_to: }.compact
    params[:authenticity_token] = token unless token == :none
    post("/auth/google_oauth2", params:)
    follow_redirect! if response.redirect? && response.location.include?("/auth/google_oauth2/callback")
  end

  around do |example|
    OmniAuth.config.test_mode = true
    example.run
  ensure
    OmniAuth.config.test_mode = false
    OmniAuth.config.mock_auth[:google_oauth2] = nil
  end

  before { mock_google }

  describe "intent=sign_in" do
    it "Googleが確認済みとしたメールなら、確認済みの利用者を作ってloginし、return_toへ戻す" do
      start_google(return_to: "/record")

      expect(response).to redirect_to("http://www.example.com/record")
      user = User.find_by!(email: "person@example.com")
      expect(user).to be_confirmed
      expect(user.sign_in_methods).to eq(["google"])
      get "/api/v1/session"
      expect(response.parsed_body["user"]["id"]).to eq(user.id)
    end

    it "2回目以降は同じ利用者へloginする（provider/uidで対応付ける）" do
      start_google
      reset!
      mock_google(email: "changed@example.com")

      expect { start_google }.not_to change(User, :count)
      expect(response).to redirect_to("http://www.example.com/")
    end

    it "Googleがメールを確認済みとしていなければ、利用者を作らず/login?auth_error=google_auth_failed" do
      mock_google(email_verified: false)

      expect { start_google }.not_to change(User, :count)
      expect(response).to redirect_to("http://www.example.com/login?auth_error=google_auth_failed")
    end

    it "確認済みメールがpasswordの利用者と一致したら、接続も作成もせずgoogle_email_conflict" do
      existing = create(:user, email: "person@example.com")

      expect { start_google }.not_to change(UserIdentity, :count)
      expect(response).to redirect_to("http://www.example.com/login?auth_error=google_email_conflict")
      expect(existing.reload.identities).to be_empty
      get "/api/v1/session"
      expect(response.parsed_body["authenticated"]).to be(false)
    end

    it "Google側の失敗は/login?auth_error=google_auth_failed" do
      OmniAuth.config.mock_auth[:google_oauth2] = :invalid_credentials

      start_google

      follow_redirect! while response.location&.include?("/auth/failure")
      expect(response).to redirect_to("http://www.example.com/login?auth_error=google_auth_failed")
    end

    it "stateが合わないcallbackは/login?auth_error=google_auth_failed（test modeを外し、本物のstrategyで確かめる）" do
      OmniAuth.config.test_mode = false

      get "/auth/google_oauth2/callback", params: { state: "forged-state", code: "any-code" }

      expect(response).to redirect_to("http://www.example.com/login?auth_error=google_auth_failed")
      expect(User.count).to eq(0)
    end

    it "CSRF tokenが無い開始POSTは403 csrf_invalid" do
      start_google(token: :none)

      expect(response).to have_http_status(:forbidden)
      expect(problem_code).to eq("csrf_invalid")
    end

    it "開始がIPごとに1時間50回を超えたら、Googleへ進まず/login?auth_error=rate_limited", :fixed_time do
      token = csrf_token
      50.times do
        post("/auth/google_oauth2", params: { authenticity_token: token })
        expect(response.location).not_to include("auth_error=rate_limited")
      end

      expect { start_google(token:) }.not_to change(User, :count)
      expect(response).to redirect_to("http://www.example.com/login?auth_error=rate_limited")
      expect(response.headers["Cache-Control"]).to eq("no-store")
    end

    it "再認証の開始が制限に掛かったら、return_toへauth_error=rate_limitedを付けて戻す", :fixed_time do
      token = csrf_token
      50.times { post("/auth/google_oauth2", params: { authenticity_token: token }) }

      start_google(intent: "reauthenticate", return_to: "/settings/account", token:)

      expect(response).to redirect_to("http://www.example.com/settings/account?auth_error=rate_limited")
    end

    it "GETでは開始できない" do
      get "/auth/google_oauth2"

      expect(response).to have_http_status(:not_found)
    end

    it "return_toが素のpathでなければ/へ戻す（改行・外部URL・query）" do
      ["/\n/evil.example", "https://evil.example/", "//evil.example", "/record?x=1", "/../x"].each do |bad|
        reset!
        start_google(return_to: bad)

        expect(response).to redirect_to("http://www.example.com/")
      end
    end
  end

  describe "intent=reauthenticate" do
    let(:user) { create(:user, :google_only, google_uid:) }

    def sign_in_with_google
      start_google
      expect(response).to redirect_to("http://www.example.com/")
    end

    before { user }

    it "いまの利用者と同じGoogleの利用者で直近に認証していれば、再認証した時刻を記録してreturn_toへ戻す" do
      sign_in_with_google

      start_google(intent: "reauthenticate", return_to: "/settings/account")

      expect(response).to redirect_to("http://www.example.com/settings/account")
      get ProtectedProbeRoutes::PATH
      expect(response.parsed_body["google_reauthenticated"]).to be(true)
    end

    it "再認証の記録は5分で古くなる" do
      sign_in_with_google
      start_google(intent: "reauthenticate")
      travel 5.minutes + 1.second

      get ProtectedProbeRoutes::PATH

      expect(response.parsed_body["google_reauthenticated"]).to be(false)
    end

    it "別のGoogleの利用者ならsessionを変えずgoogle_reauthentication_mismatch" do
      sign_in_with_google
      mock_google(uid: "someone-else")

      start_google(intent: "reauthenticate", return_to: "/settings/account")

      expect(response).to redirect_to(
        "http://www.example.com/settings/account?auth_error=google_reauthentication_mismatch"
      )
      get ProtectedProbeRoutes::PATH
      expect(response.parsed_body).to include("user_id" => user.id, "google_reauthenticated" => false)
    end

    it "Googleで実際に認証した時刻（auth_time）が5分より前ならgoogle_auth_failed" do
      sign_in_with_google
      mock_google(auth_time: 6.minutes.ago.to_i)

      start_google(intent: "reauthenticate")

      expect(response).to redirect_to("http://www.example.com/?auth_error=google_auth_failed")
    end

    it "loginしていなければ/login?auth_error=google_auth_failed" do
      start_google(intent: "reauthenticate", return_to: "/settings/account")

      expect(response).to redirect_to("http://www.example.com/login?auth_error=google_auth_failed")
    end
  end

  describe "Googleへのredirect" do
    let(:strategy) do
      OmniAuth::Strategies::FocusGoogleOauth2.new(->(_env) { [200, {}, []] }, "id", "secret",
                                                  **GoogleOauthOptions::AUTHORIZE)
    end

    def authorize_params_for(params)
      env = Rack::MockRequest.env_for("/auth/google_oauth2", method: "POST", params:)
      env["rack.session"] = {}
      strategy.instance_variable_set(:@env, env)
      strategy.authorize_params
    end

    it "再認証ではmax_age=0とアカウント選択を求める" do
      expect(authorize_params_for("intent" => "reauthenticate")).to include(max_age: 0, prompt: "select_account")
    end

    it "通常のloginではmax_ageを送らない" do
      expect(authorize_params_for("intent" => "sign_in")).not_to have_key(:max_age)
    end

    it "openidとemailだけを求め、offlineのアクセス（refresh token）は求めない" do
      expect(authorize_params_for({})).to include("scope" => "openid email", "access_type" => "online")
    end

    it "requestのparameterでpromptやredirect_uriを上書きさせない" do
      params = authorize_params_for("prompt" => "none", "redirect_uri" => "https://evil.example/cb")

      expect(params).to include("prompt" => "select_account")
      expect(params).not_to have_key("redirect_uri")
    end
  end
end
