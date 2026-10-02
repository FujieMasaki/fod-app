require "rails_helper"

RSpec.describe "Registration" do
  let(:password) { "correct horse battery" }

  def register(email, password: self.password, token: csrf_token)
    json_request(:post, "/api/v1/registration", { email:, password: }, token:)
  end

  it "未登録なら未確認の利用者を作り、確認メールをSPAのリンク（tokenはfragment）で送る" do
    register("new@example.com")

    expect(response).to have_http_status(:accepted)
    assert_response_schema_confirm(202)
    expect(User.find_by(email: "new@example.com")).not_to be_confirmed
    expect(last_mail.to).to eq(["new@example.com"])
    expect(last_mail.body.to_s).to match(%r{http://localhost:5173/confirmation#token=\S+})
  end

  it "登録済みでも同じ202で、利用者を作らずログインと再設定を案内するメールを送る" do
    existing = create(:user)

    expect { register(existing.email.upcase) }.not_to change(User, :count)
    expect(response).to have_http_status(:accepted)
    expect(response.body).to be_empty
    expect(last_mail.subject).to include("登録済み")
    expect(last_mail.body.to_s).not_to include("#token=")
  end

  it "passwordが8文字未満なら422 out_of_range、メールアドレスの形が違えば422 invalid_format" do
    register("bad-email", password: "short")

    expect(response).to have_http_status(:unprocessable_content)
    expect(response.parsed_body["errors"]).to contain_exactly(
      { "field" => "email", "code" => "invalid_format" },
      { "field" => "password", "code" => "out_of_range" }
    )
    assert_response_schema_confirm(422)
  end

  it "空白だけのpasswordも、8文字以上なら受け付け、確認後にそのpasswordでloginできる" do
    register("spaces@example.com", password: " " * 8)
    expect(response).to have_http_status(:accepted)

    json_request(:patch, "/api/v1/confirmation", { token: token_from(last_mail) })
    sign_in_with_password(User.find_by!(email: "spaces@example.com"), password: " " * 8)
  end

  it "passwordが129文字なら422 too_long。128文字は受け付ける" do
    register("long@example.com", password: "a" * 129)
    expect(response.parsed_body["errors"]).to eq([{ "field" => "password", "code" => "too_long" }])

    register("long@example.com", password: "a" * 128)
    expect(response).to have_http_status(:accepted)
  end

  it "同じ宛先へのメールは60秒に1回まで（2回目も202で、メールは送らない）", :fixed_time do
    token = csrf_token
    register("new@example.com", token:)
    register("new@example.com", token:)

    expect(response).to have_http_status(:accepted)
    expect(ActionMailer::Base.deliveries.size).to eq(1)
  end

  it "IPの制限に掛かったら、passwordのhashを計算しない", :fixed_time do
    allow(User).to receive(:new).and_call_original
    token = csrf_token
    20.times { |n| register("user#{n}@example.com", token:) }

    register("one-more@example.com", token:)

    expect(User).to have_received(:new).exactly(20).times
  end

  it "IPごとに1時間20回を超えたら429 rate_limited", :fixed_time do
    token = csrf_token
    20.times { |n| register("user#{n}@example.com", token:) }

    register("one-more@example.com", token:)

    expect(response).to have_http_status(:too_many_requests)
    assert_response_schema_confirm(429)
  end

  it "CSRF tokenが無ければ403 csrf_invalid" do
    register("new@example.com", token: :none)

    expect(problem_code).to eq("csrf_invalid")
    assert_response_schema_confirm(403)
  end

  it "JSONとして読めないbodyは422 validation_failed" do
    post "/api/v1/registration", params: "{not json",
                                 headers: { "CONTENT_TYPE" => "application/json", "X-CSRF-Token" => csrf_token }

    expect(response).to have_http_status(:unprocessable_content)
    assert_response_schema_confirm(422)
  end
end
