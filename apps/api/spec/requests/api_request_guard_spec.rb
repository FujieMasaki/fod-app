require "rails_helper"

RSpec.describe ApiRequestGuard do
  let(:user) { create(:user) }
  let(:dot) { create(:dot, user:, sentence: "元の一文") }
  let(:form) { { "CONTENT_TYPE" => "application/x-www-form-urlencoded", "X-CSRF-Token" => csrf_token } }

  def field_errors = response.parsed_body["errors"]

  before { sign_in_with_password(user) }

  it "JSON以外のbodyは解析せず422 body invalid_format。不正なUTF-8の値も本文をログに出さない" do
    ["sentence=ログに出したくない一文", "sentence=ログに出したくない一文%FF"].each do |body|
      log = captured_log { patch "/api/v1/dots/#{dot.id}", params: body, headers: form }

      expect(field_errors).to eq([{ "field" => "body", "code" => "invalid_format" }]), body
      expect(response.headers["Cache-Control"]).to eq("no-store")
      assert_response_schema_confirm(422)
      expect(log).not_to include("ログに出したくない一文"), body
    end
    expect(dot.reload.sentence).to eq("元の一文")
  end

  # routerは`//`をまとめ、末尾の`/`を外してからrouteを探す。生のpathで比べると検査を迂回される。
  it "表記を変えたpathでも、routerと同じ正規化をしてから検査する" do
    ["//api/v1/dots/#{dot.id}", "/api//v1/dots/#{dot.id}", "/api/v1/dots/#{dot.id}/"].each do |path|
      patch path, params: "sentence=変更", headers: form

      expect(field_errors).to eq([{ "field" => "body", "code" => "invalid_format" }]), path
    end
    expect(dot.reload.sentence).to eq("元の一文")
  end

  it "認証のendpointでも、formで送ったpasswordをログに出さない" do
    body = "email=#{ERB::Util.url_encode(user.email)}&password=ログに出したくない合言葉%FF"
    log = captured_log { post "/api/v1/session", params: body, headers: form }

    expect(field_errors).to eq([{ "field" => "body", "code" => "invalid_format" }])
    expect(log).not_to include("ログに出したくない合言葉")
  end

  it "multipart・Content-Typeの無いbody・長さの無いchunkedのbodyも422 body invalid_format" do
    [{ "CONTENT_TYPE" => "multipart/form-data; boundary=x" }, {},
     { "CONTENT_TYPE" => "text/plain", "HTTP_TRANSFER_ENCODING" => "chunked", "CONTENT_LENGTH" => nil }]
      .each do |headers|
        patch "/api/v1/dots/#{dot.id}", params: "x", headers: { "X-CSRF-Token" => csrf_token }.merge(headers)

        expect(field_errors).to eq([{ "field" => "body", "code" => "invalid_format" }]), headers.inspect
      end
  end

  it "charsetの付いたJSONは受け付ける" do
    json_request(:patch, "/api/v1/dots/#{dot.id}", { sentence: "直した一文" },
                 headers: { "CONTENT_TYPE" => "application/json; charset=utf-8" })

    expect(response).to have_http_status(:ok)
  end

  it "query・pathの不正なUTF-8は422 request invalid_formatにし、値をログに出さない" do
    secret = ERB::Util.url_encode("ログに出したくない値")
    log = captured_log do
      get "/api/v1/days?cursor=#{secret}%FF"
      expect(field_errors).to eq([{ "field" => "request", "code" => "invalid_format" }])
      assert_response_schema_confirm(422)

      json_request(:patch, "/api/v1/dots/#{secret}%FF", { sentence: "変更" })
      expect(field_errors).to eq([{ "field" => "request", "code" => "invalid_format" }])
    end

    expect(log).not_to include("ログに出したくない値")
  end
end
