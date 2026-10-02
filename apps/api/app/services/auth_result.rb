# 認証まわりのServiceの結果。controllerは`status`で応答を選ぶ。
#
# - errors: `validation_failed`の項目ごとの理由（契約のFieldError）
# - retry_after_seconds: `rate_limited`で待つ秒数
AuthResult = Data.define(:status, :user, :errors, :retry_after_seconds) do
  def self.of(status, user: nil, errors: nil, retry_after_seconds: nil)
    new(status:, user:, errors:, retry_after_seconds:)
  end

  def self.rate_limited(limit) = of(:rate_limited, retry_after_seconds: limit.retry_after_seconds)

  # ActiveModel::Errorsを契約のFieldErrorへ変える。登録の有無を明かさないため`taken`は返さない。
  def self.validation_failed(model_errors)
    errors = model_errors.filter_map do |error|
      code = AuthResult::FIELD_ERROR_CODES[error.type]
      { field: error.attribute.to_s, code: } if code
    end
    of(:validation_failed, errors: errors.uniq)
  end
end

AuthResult::FIELD_ERROR_CODES = {
  blank: "required",
  too_long: "too_long",
  # 契約のFieldErrorに`too_short`は無いので、範囲外として返す（契約のNewCredentials）
  too_short: "out_of_range",
  invalid: "invalid_format"
}.freeze
