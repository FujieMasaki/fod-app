require "rails_helper"

RSpec.describe "Unlock" do
  let(:user) { create(:user) }

  def lock_and_take_token
    token = csrf_token
    10.times do
      json_request(:post, "/api/v1/session", { email: user.email, password: "wrong password" }, token:)
    end
    token_from(last_mail)
  end

  def unlock(token) = json_request(:patch, "/api/v1/unlock", { token: })

  it "解除メールのリンクでロックを解くと、loginできる" do
    unlock(lock_and_take_token)

    expect(response).to have_http_status(:no_content)
    assert_response_schema_confirm(204)
    sign_in_with_password(user)
  end

  it "解除メールのリンクはSPAの画面を指し、tokenはfragmentに載せる" do
    lock_and_take_token

    expect(last_mail.body.to_s).to match(%r{/unlock#token=\S+})
  end

  it "使用済み・でたらめなtokenは422 token_invalid" do
    token = lock_and_take_token
    unlock(token)
    unlock(token)

    expect(problem_code).to eq("token_invalid")
    assert_response_schema_confirm(422)
  end

  it "CSRF tokenが無ければ403 csrf_invalid" do
    json_request(:patch, "/api/v1/unlock", { token: "anything" }, token: :none)

    expect(problem_code).to eq("csrf_invalid")
    assert_response_schema_confirm(403)
  end
end
