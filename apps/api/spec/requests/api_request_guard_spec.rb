require "rails_helper"

RSpec.describe ApiRequestGuard do
  let(:user) { create(:user) }
  let(:dot) { create(:dot, user:, sentence: "元の一文") }

  def captured_log
    log = StringIO.new
    logger = ActiveSupport::Logger.new(log, level: :debug)
    Rails.logger.broadcast_to(logger)
    yield
    log.string
  ensure
    Rails.logger.stop_broadcasting_to(logger)
  end

  def field_errors = response.parsed_body["errors"]

  before { sign_in_with_password(user) }

  it "JSON以外のbodyは解析せず422 body invalid_format。不正なUTF-8の値も本文をログに出さない" do
    ["sentence=ログに出したくない一文", "sentence=ログに出したくない一文%FF"].each do |body|
      headers = { "CONTENT_TYPE" => "application/x-www-form-urlencoded", "X-CSRF-Token" => csrf_token }
      log = captured_log { patch "/api/v1/dots/#{dot.id}", params: body, headers: }

      expect(field_errors).to eq([{ "field" => "body", "code" => "invalid_format" }]), body
      expect(response.headers["Cache-Control"]).to eq("no-store")
      assert_response_schema_confirm(422)
      expect(log).not_to include("ログに出したくない一文"), body
    end
    expect(dot.reload.sentence).to eq("元の一文")
  end

  it "multipartやContent-Typeの無いbodyも422 body invalid_format" do
    [{ "CONTENT_TYPE" => "multipart/form-data; boundary=x" }, {}].each do |content_type|
      patch "/api/v1/dots/#{dot.id}", params: "x", headers: { "X-CSRF-Token" => csrf_token }.merge(content_type)

      expect(field_errors).to eq([{ "field" => "body", "code" => "invalid_format" }]), content_type.inspect
    end
  end

  it "charsetの付いたJSONは受け付ける" do
    json_request(:patch, "/api/v1/dots/#{dot.id}", { sentence: "直した一文" },
                 headers: { "CONTENT_TYPE" => "application/json; charset=utf-8" })

    expect(response).to have_http_status(:ok)
  end

  it "queryの不正なUTF-8は422 query invalid_formatにし、値をログに出さない" do
    log = captured_log { get "/api/v1/days?cursor=#{ERB::Util.url_encode('ログに出したくない値')}%FF" }

    expect(field_errors).to eq([{ "field" => "query", "code" => "invalid_format" }])
    assert_response_schema_confirm(422)
    expect(log).not_to include("ログに出したくない値")
  end
end
