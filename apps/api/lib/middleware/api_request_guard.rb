# `/api/`のrequestを、Railsがparamsを解析する前後で守る（TASK-008）。どちらも本文をログへ出さず、
# 契約のProblem（`422 validation_failed`）で返す。
#
# 1. bodyのContent-Typeが`application/json`でなければ、解析する前に`body`の`invalid_format`で拒否する。
#    契約のrequestBodyはJSONだけで、formのbodyを受け付けると、不正なUTF-8の値から本文を含むmessageの
#    `BadRequest`が起きる（下の2）。JSON以外を受け取るendpointは`NON_JSON_BODIES`に足す
#    （`POST /api/v1/dots`の音声のmultipart。TASK-009）。
# 2. paramsを解釈できないときにRailsが起こす`ActionController::BadRequest`（path・queryの不正なUTF-8など）を
#    捕まえ、`request`の`invalid_format`にする。`rescue_from`の外で起きるため、捕まえないとProblem形式でない`400`になり、値を含む
#    messageを`DebugExceptions`がerrorのログへ出す。そのためこのmiddlewareは`DebugExceptions`の内側に置く。
#
# pathはrouterと同じ規則（`//`をまとめ、末尾の`/`を外す）で正規化してから比べる。生の`path`で比べると、
# `//api/...`のように表記を変えたrequestが検査を通らずにrouteへ届くため。
#
# 3. JSON以外の本文を受け付けるendpointは、Railsが本文を解析する（multipartを一時ファイルへ書き出す）前に、
#    Content-Lengthで大きさを制限する。解析は認証・CSRFの確認より前に起きるため、制限しないと未ログインでも
#    任意の大きさの本文を解析させられる。長さの無い（chunkedの）本文は受け付けない。ここで防げるのは解析だけで、
#    本文の受け取りそのものは、Pumaの`http_content_length_limit`（`config/puma.rb`）が止める。
#
# JSONのbodyの不正なUTF-8は`config/initializers/json_request_body.rb`が解析の失敗にする。`/auth/...`
# （Googleログインのform POST）はJSON APIではないので対象にしない。
class ApiRequestGuard
  API_PATH = "/api".freeze
  JSON_MEDIA_TYPE = "application/json".freeze
  # { [method, path] => 受け取るmedia type }
  NON_JSON_BODIES = { %w[POST /api/v1/dots] => "multipart/form-data" }.freeze
  # JSON以外の本文の上限（byte）。音声の上限（UploadedAudio::MAX_BYTES = 32MB）にmultipartの区切りなどの余裕を足す
  NON_JSON_BODY_LIMIT = 33 * 1024 * 1024

  def initialize(app)
    @app = app
  end

  def call(env)
    request = Rack::Request.new(env)
    path = ActionDispatch::Journey::Router::Utils.normalize_path(request.path_info)
    return @app.call(env) unless path == API_PATH || path.start_with?("#{API_PATH}/")

    guard(env, request, path)
  end

  private

  def guard(env, request, path)
    return invalid_format("body") if body?(request) && !accepted_media_type?(request, path)
    return oversized_body(request) if NON_JSON_BODIES.key?([request.request_method, path]) && oversized_body?(request)

    @app.call(env)
  rescue ActionController::BadRequest
    invalid_format("request")
  end

  def body?(request)
    request.content_length.to_i.positive? || request.get_header("HTTP_TRANSFER_ENCODING").present?
  end

  def accepted_media_type?(request, path)
    expected = NON_JSON_BODIES.fetch([request.request_method, path], JSON_MEDIA_TYPE)
    request.media_type&.downcase == expected
  end

  def oversized_body?(request)
    request.content_length.nil? || request.content_length.to_i > NON_JSON_BODY_LIMIT
  end

  # 長さの無い本文は解析しない（大きさを先に確かめられないため）
  def oversized_body(request)
    return invalid_format("body") if request.content_length.nil?

    respond(ProblemDetails.new(:audio_too_large))
  end

  def invalid_format(field)
    respond(ProblemDetails.new(:validation_failed, errors: [{ field:, code: "invalid_format" }]))
  end

  def respond(problem)
    headers = { "content-type" => ProblemDetails::CONTENT_TYPE, "cache-control" => "no-store" }
    [problem.status, headers, [problem.as_json.to_json]]
  end
end
