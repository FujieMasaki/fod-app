require "rails_helper"

RSpec.describe "Password reset" do
  let(:user) { create(:user) }
  let(:new_password) { "brand new password" }

  def request_reset(email) = json_request(:post, "/api/v1/password", { email: })

  def reset(token, password: new_password) = json_request(:patch, "/api/v1/password", { token:, password: })

  def take_reset_token
    request_reset(user.email)
    token_from(last_mail)
  end

  describe "POST /api/v1/password" do
    it "password利用者には、SPAのリンク（tokenはfragment）で再設定メールを送る" do
      request_reset(user.email)

      expect(response).to have_http_status(:accepted)
      assert_response_schema_confirm(202)
      expect(last_mail.body.to_s).to match(%r{/password/reset#token=\S+})
    end

    it "Google専用の利用者にはtokenを発行せず、Googleでのログインを案内する" do
      google_user = create(:user, :google_only)

      request_reset(google_user.email)

      expect(response).to have_http_status(:accepted)
      expect(google_user.reload.reset_password_token).to be_nil
      expect(last_mail.subject).to include("Google")
      expect(last_mail.body.to_s).not_to include("#token=")
    end

    it "未登録でも同じ202で、メールは送らない" do
      request_reset("nobody@example.com")

      expect(response).to have_http_status(:accepted)
      expect(ActionMailer::Base.deliveries).to be_empty
    end
  end

  describe "PATCH /api/v1/password" do
    it "再設定すると新しいpasswordでloginできる。再設定してもloginはしない" do
      reset(take_reset_token)

      expect(response).to have_http_status(:no_content)
      assert_response_schema_confirm(204)
      get ProtectedProbeRoutes::PATH
      expect(response).to have_http_status(:unauthorized)
      sign_in_with_password(user, password: new_password)
    end

    it "使用済みのtokenは422 token_invalid" do
      token = take_reset_token
      reset(token)
      reset(token, password: "yet another password")

      expect(problem_code).to eq("token_invalid")
      assert_response_schema_confirm(422)
    end

    it "6時間を過ぎたtokenは422 token_expired" do
      token = take_reset_token
      travel 6.hours + 1.second

      reset(token)

      expect(problem_code).to eq("token_expired")
      assert_response_schema_confirm(422)
    end

    it "再送すると古いtokenは使えない" do
      old_token = take_reset_token
      travel 61.seconds
      take_reset_token

      reset(old_token)

      expect(problem_code).to eq("token_invalid")
    end

    it "passwordが方針に合わなければ422で、tokenは消費しない" do
      token = take_reset_token

      reset(token, password: "short")
      expect(response.parsed_body["errors"]).to eq([{ "field" => "password", "code" => "out_of_range" }])
      assert_response_schema_confirm(422)

      reset(token)
      expect(response).to have_http_status(:no_content)
    end

    it "ロック中の利用者は、再設定するとロックも解ける" do
      token = take_reset_token
      user.lock_access!(send_instructions: false)

      reset(token)

      expect(user.reload).not_to be_access_locked
    end

    it "空のtokenはtokenを持たない利用者に一致せず422 validation_failed" do
      user
      reset("")

      expect(problem_code).to eq("validation_failed")
    end
  end
end
