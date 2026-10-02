# 認証まわりのrequest specで使う。CSRF tokenを取得し、JSONの変更requestに付けて送る。
module AuthRequestHelpers
  DEFAULT_PASSWORD = "correct horse battery".freeze

  def csrf_token
    get "/api/v1/session"
    response.parsed_body.fetch("csrf_token")
  end

  # tokenに:noneを渡すとX-CSRF-Tokenを付けない。
  def json_request(method, path, body = {}, token: csrf_token, headers: {})
    request_headers = { "CONTENT_TYPE" => "application/json", "ACCEPT" => "application/json" }.merge(headers)
    request_headers["X-CSRF-Token"] = token unless token == :none
    public_send(method, path, params: body.to_json, headers: request_headers)
  end

  def sign_in_with_password(user, password: DEFAULT_PASSWORD)
    json_request(:post, "/api/v1/session", { email: user.email, password: })
    expect(response).to have_http_status(:ok)
  end

  def problem_code = response.parsed_body["code"]

  def last_mail = ActionMailer::Base.deliveries.last

  # メール本文のリンクのfragmentからtokenを取り出す。
  def token_from(mail) = mail.body.to_s[/#token=([^\s]+)/, 1].then { |token| CGI.unescape(token) }
end

RSpec.configure do |config|
  config.include AuthRequestHelpers, type: :request
  config.include ActiveSupport::Testing::TimeHelpers
  config.include ActiveJob::TestHelper
  config.before { ActionMailer::Base.deliveries.clear }
  # メールはjobで送るので、request specではenqueueしたjobをその場で実行して結果を確かめる。
  # 試行回数は固定の時間枠（60秒・1時間）で数える。実行した時刻が枠の境目に近いと途中で枠が変わり、
  # 結果が変わるため、回数を確かめるexampleは`fixed_time: true`で枠の頭に時刻を固定する。
  config.around(:each, :fixed_time) do |example|
    travel_to(Time.zone.parse("2026-10-02 10:00:00")) { example.run }
  end

  # `perform_jobs: false`を付けたexampleでは実行せず、enqueueだけを確かめる。
  config.around(type: :request) do |example|
    example.metadata[:perform_jobs] == false ? example.run : perform_enqueued_jobs { example.run }
  end
end
