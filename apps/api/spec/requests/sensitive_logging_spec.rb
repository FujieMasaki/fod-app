require "rails_helper"

# password・token・メールアドレス・Googleのcodeを、ログとresponseへ出さない（TASK-006の完了条件4）。
RSpec.describe "Sensitive data in logs and responses" do
  let(:log) { StringIO.new }
  let(:logger) { ActiveSupport::Logger.new(log) }
  let(:password) { "very secret password" }
  let(:user) { create(:user, email: "secret-person@example.com", password:) }

  around do |example|
    Rails.logger.broadcast_to(logger)
    example.run
  ensure
    Rails.logger.stop_broadcasting_to(logger)
  end

  it "loginのpasswordとメールアドレスをログにもresponseにも出さない" do
    json_request(:post, "/api/v1/session", { email: user.email, password: })
    json_request(:post, "/api/v1/session", { email: user.email, password: "#{password} wrong" })

    expect(log.string).to include("[FILTERED]")
    expect(log.string).not_to include(password, user.email)
    expect(response.body).not_to include(password, user.email)
  end

  it "再設定のtokenと新しいpasswordをログに出さない" do
    json_request(:post, "/api/v1/password", { email: user.email })
    token = token_from(last_mail)
    log.truncate(0)

    json_request(:patch, "/api/v1/password", { token:, password: "another secret password" })

    expect(response).to have_http_status(:no_content)
    expect(log.string).not_to include(token, "another secret password")
  end

  it "Google callbackのcodeとstateをログに出さない" do
    get "/auth/google_oauth2/callback", params: { code: "google-auth-code-123", state: "oauth-state-456" }

    expect(log.string).not_to include("google-auth-code-123", "oauth-state-456")
  end

  it "Sessionのresponseに内部の属性を含めない" do
    sign_in_with_password(user, password:)

    expect(response.body).not_to include("encrypted_password", "failed_attempts", "confirmation_token")
  end
end
