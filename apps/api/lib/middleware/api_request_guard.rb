# `/api/`のrequestを、Railsがparamsを解析する前後で守る（TASK-008）。どちらも本文をログへ出さず、
# 契約のProblem（`422 validation_failed`）で返す。
#
# 1. bodyのContent-Typeが`application/json`でなければ、解析する前に`body`の`invalid_format`で拒否する。
#    契約のrequestBodyはJSONだけで、formのbodyを受け付けると、不正なUTF-8の値から本文を含むmessageの
#    `BadRequest`が起きる（下の2）。JSON以外を受け取るendpointは`NON_JSON_BODIES`に足す
#    （`POST /api/v1/dots`のmultipartはTASK-009）。
# 2. paramsを解釈できないときにRailsが起こす`ActionController::BadRequest`（queryの不正なUTF-8など）を
#    捕まえる。`rescue_from`の外で起きるため、捕まえないとProblem形式でない`400`になり、値を含む
#    messageを`DebugExceptions`がerrorのログへ出す。そのためこのmiddlewareは`DebugExceptions`の内側に置く。
#
# JSONのbodyの不正なUTF-8は`config/initializers/json_request_body.rb`が解析の失敗にする。`/auth/...`
# （Googleログインのform POST）はJSON APIではないので対象にしない。
class ApiRequestGuard
  PATH_PREFIX = "/api/".freeze
  JSON_MEDIA_TYPE = "application/json".freeze
  # { [method, path] => 受け取るmedia type }
  NON_JSON_BODIES = {}.freeze

  def initialize(app)
    @app = app
  end

  def call(env)
    request = Rack::Request.new(env)
    return @app.call(env) unless request.path.start_with?(PATH_PREFIX)
    return invalid_format("body") if body?(request) && !accepted_media_type?(request)

    @app.call(env)
  rescue ActionController::BadRequest
    invalid_format("query")
  end

  private

  def body?(request)
    request.content_length.to_i.positive? || request.get_header("HTTP_TRANSFER_ENCODING").present?
  end

  def accepted_media_type?(request)
    expected = NON_JSON_BODIES.fetch([request.request_method, request.path], JSON_MEDIA_TYPE)
    request.media_type&.downcase == expected
  end

  def invalid_format(field)
    problem = ProblemDetails.new(:validation_failed, errors: [{ field:, code: "invalid_format" }])
    headers = { "content-type" => ProblemDetails::CONTENT_TYPE, "cache-control" => "no-store" }
    [problem.status, headers, [problem.as_json.to_json]]
  end
end
