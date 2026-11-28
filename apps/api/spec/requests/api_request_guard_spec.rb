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

  describe "音声の送信（POST /api/v1/dots）のmultipart" do
    let(:multipart_headers) { { "X-CSRF-Token" => csrf_token } }

    def multipart_body(boundary, parts)
      parts.map do |name, value, filename|
        disposition = %(form-data; name="#{name}") + (filename ? %(; filename="#{filename}") : "")
        type = filename ? "Content-Type: audio/webm\r\n" : ""
        "--#{boundary}\r\nContent-Disposition: #{disposition}\r\n#{type}\r\n#{value}\r\n"
      end.join + "--#{boundary}--\r\n"
    end

    def post_multipart(body, headers = {})
      headers = multipart_headers.merge("CONTENT_TYPE" => "multipart/form-data; boundary=x").merge(headers)
      post "/api/v1/dots", params: body, headers:
    end

    it "このendpointだけはmultipartをControllerまで通し、JSONやformの本文は拒否する" do
      post_multipart(multipart_body("x", [["duration_seconds", "120"], ["audio", "\x1A\x45\xDF\xA3", "a.webm"]]))
      expect(problem_code).to eq("attempt_invalid") # Controllerまで届いた（attemptを付けていない）

      json_request(:post, "/api/v1/dots", { duration_seconds: 1 })
      expect(field_errors).to eq([{ "field" => "body", "code" => "invalid_format" }])
    end

    it "Content-Lengthが上限を超えたら、本文を解析する前に413にする" do
      expect(Rack::Multipart::Parser).not_to receive(:new) # rubocop:disable RSpec/MessageSpies

      post_multipart("x", "CONTENT_LENGTH" => (ApiRequestGuard::NON_JSON_BODY_LIMIT + 1).to_s)

      expect(response).to have_http_status(:content_too_large)
      expect(problem_code).to eq("audio_too_large")
    end

    it "上限は音声の上限より大きい（multipartの区切りの分の余裕）" do
      expect(ApiRequestGuard::NON_JSON_BODY_LIMIT).to be > UploadedAudio::MAX_BYTES
    end

    it "長さの無い（chunkedの）本文は解析しない" do
      post_multipart("x", "HTTP_TRANSFER_ENCODING" => "chunked", "CONTENT_LENGTH" => nil)

      expect(field_errors).to eq([{ "field" => "body", "code" => "invalid_format" }])
    end

    it "壊れたmultipartは500にせず422にする" do
      post_multipart("--x\r\nContent-Disposition: form-data; name=\"audio\"; filename=\"a\"\r\n\r\ntruncated")

      expect(response).to have_http_status(:unprocessable_content)
    end

    it "Railsが包まないmultipartの解析の失敗（長すぎるboundary）も、500にせず422にする" do
      boundary = "b" * 71
      post_multipart(multipart_body(boundary, [%w[duration_seconds 120]]),
                     "CONTENT_TYPE" => "multipart/form-data; boundary=#{boundary}")

      expect(response).to have_http_status(:unprocessable_content)
      expect(field_errors).to eq([{ "field" => "request", "code" => "invalid_format" }])
    end

    it "textのpartの不正なUTF-8は422にし、値をログに出さない" do
      body = multipart_body("x", [["duration_seconds", "ログに出したくない値\xFF".b]])

      log = captured_log { post_multipart(body.b) }

      expect(response).to have_http_status(:unprocessable_content)
      expect(log).not_to include("ログに出したくない値")
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
