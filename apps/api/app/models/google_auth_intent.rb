# Googleログインの開始時に受け取ったintentとreturn_toを、callbackまでsessionに控える値。
class GoogleAuthIntent < Data.define(:intent, :return_to)
  SESSION_KEY = "fod.google_auth".freeze
  INTENTS = %w[sign_in reauthenticate].freeze
  # 契約のGoogleAuthStart.return_to。文字列全体で照合する（`^`・`$`は改行の前後にも一致するため）。
  RETURN_TO_PATTERN = %r{\A/(?:[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*)?\z}
  RETURN_TO_MAX_LENGTH = 512
  DEFAULT_RETURN_TO = "/".freeze

  def self.from_params(params)
    intent = INTENTS.include?(params["intent"]) ? params["intent"] : "sign_in"
    new(intent:, return_to: sanitize_return_to(params["return_to"]))
  end

  # sessionに控えた値を読む。壊れていれば安全な既定値に戻す。
  def self.from_session(value)
    from_params(value.is_a?(Hash) ? value : {})
  end

  # 合わない値は拒否せず既定値へ置き換える（open redirectを防ぎつつ、ログインそのものは失敗させない）。
  def self.sanitize_return_to(value)
    return DEFAULT_RETURN_TO unless value.is_a?(String) && value.length <= RETURN_TO_MAX_LENGTH
    return DEFAULT_RETURN_TO unless RETURN_TO_PATTERN.match?(value)

    value
  end

  def reauthenticate? = intent == "reauthenticate"

  def to_session = { "intent" => intent, "return_to" => return_to }
end
