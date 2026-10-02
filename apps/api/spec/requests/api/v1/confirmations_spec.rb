require "rails_helper"

RSpec.describe "Confirmation" do
  def register_and_take_token(email = "new@example.com")
    json_request(:post, "/api/v1/registration", { email:, password: AuthRequestHelpers::DEFAULT_PASSWORD })
    token_from(last_mail)
  end

  def confirm(token) = json_request(:patch, "/api/v1/confirmation", { token: })

  describe "PATCH /api/v1/confirmation" do
    it "確認するとloginできるようになる。確認してもloginはしない" do
      confirm(register_and_take_token)

      expect(response).to have_http_status(:no_content)
      assert_response_schema_confirm(204)
      get ProtectedProbeRoutes::PATH
      expect(response).to have_http_status(:unauthorized)
      sign_in_with_password(User.find_by!(email: "new@example.com"))
    end

    it "使用済みのtokenは422 token_invalid" do
      token = register_and_take_token
      confirm(token)
      confirm(token)

      expect(problem_code).to eq("token_invalid")
      assert_response_schema_confirm(422)
    end

    it "24時間を過ぎたtokenは422 token_expired" do
      token = register_and_take_token
      travel 24.hours + 1.second

      confirm(token)

      expect(problem_code).to eq("token_expired")
      assert_response_schema_confirm(422)
    end

    it "でたらめなtokenは422 token_invalid" do
      confirm("not-a-token")

      expect(problem_code).to eq("token_invalid")
    end
  end

  describe "POST /api/v1/confirmation" do
    def resend(email) = json_request(:post, "/api/v1/confirmation", { email: })

    it "未確認の利用者には、60秒後なら確認メールを再送する" do
      register_and_take_token
      travel 61.seconds

      expect { resend("new@example.com") }.to change(ActionMailer::Base.deliveries, :size).by(1)
      expect(response).to have_http_status(:accepted)
      assert_response_schema_confirm(202)
    end

    it "確認済み・未登録でも同じ202で、メールは送らない" do
      confirmed = create(:user)

      resend(confirmed.email)
      expect(response).to have_http_status(:accepted)
      resend("nobody@example.com")
      expect(response).to have_http_status(:accepted)
      expect(ActionMailer::Base.deliveries).to be_empty
    end

    it "同じ宛先は確認と再設定を合わせて1時間5回まで" do
      user = create(:user, :unconfirmed)
      6.times do
        resend(user.email)
        travel 61.seconds
      end

      expect(ActionMailer::Base.deliveries.size).to eq(5 + 1) # 作成時の確認メールを含む
    end
  end
end
