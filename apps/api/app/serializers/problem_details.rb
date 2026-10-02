# RFC 9457のProblem Details（契約のProblem）。`title`・`detail`に個人データを入れない。
# codeとHTTP statusの対応は`contracts/README.md` §5の表。
class ProblemDetails
  STATUSES = {
    unauthenticated: 401,
    session_expired: 401,
    invalid_credentials: 401,
    email_unconfirmed: 403,
    csrf_invalid: 403,
    reauthentication_failed: 403,
    google_reauthentication_required: 403,
    not_found: 404,
    validation_failed: 422,
    token_invalid: 422,
    token_expired: 422,
    rate_limited: 429,
    internal_error: 500
  }.freeze

  TITLES = {
    unauthenticated: "ログインが必要です",
    session_expired: "ログインの有効期限が切れました",
    invalid_credentials: "メールアドレスまたはパスワードが違います",
    email_unconfirmed: "メールアドレスの確認が済んでいません",
    csrf_invalid: "リクエストを確認できませんでした",
    reauthentication_failed: "パスワードが違います",
    google_reauthentication_required: "Googleで再度ログインしてください",
    not_found: "見つかりません",
    validation_failed: "入力内容を確認してください",
    token_invalid: "リンクが無効です",
    token_expired: "リンクの有効期限が切れました",
    rate_limited: "しばらく待ってから再度お試しください",
    internal_error: "問題が発生しました"
  }.freeze

  CONTENT_TYPE = "application/problem+json".freeze

  attr_reader :status

  def initialize(code, **extensions)
    @code = code.to_sym
    @status = STATUSES.fetch(@code)
    @extensions = extensions
  end

  def as_json(*)
    {
      type: "urn:focus-on-dot:problem:#{@code}",
      title: TITLES.fetch(@code),
      status:,
      code: @code.to_s,
      **@extensions
    }
  end
end
