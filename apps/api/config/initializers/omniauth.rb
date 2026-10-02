require Rails.root.join("lib/omniauth/strategies/focus_google_oauth2").to_s
require Rails.root.join("lib/omniauth/google_start_throttle").to_s

# Googleログイン。開始はPOSTだけを受け、omniauth-rails_csrf_protectionがRailsのCSRF tokenを検証する。
# 失敗（CSRF・state不一致・キャンセルなど）はAuth::GoogleCallbacksController#failureで契約どおりに返す。
OmniAuth.config.allowed_request_methods = [:post]
OmniAuth.config.logger = Rails.logger

# 開始時のintentとreturn_toをsessionへ控える。OmniAuthはGETのparameterしか控えないため。
OmniAuth.config.before_request_phase = lambda do |env|
  request = Rack::Request.new(env)
  env["rack.session"][GoogleAuthIntent::SESSION_KEY] = GoogleAuthIntent.from_params(request.POST).to_session
  # sessionを書き直すとCookieが書き直されるので、login中ならcontrollerと同じ有効期限を付け直す
  # （付けないと、再認証の途中でブラウザを閉じたときにCookieが消える）。
  Authentication.keep_cookie_expiry(env["rack.session"], env["rack.session.options"])
end

# omniauth-rails_csrf_protectionはCSRFの不一致でRailsの例外を投げるが、OmniAuthが失敗として扱うのは
# OmniAuth::AuthenticityErrorだけ。そのままでは契約の`403 csrf_invalid`にならないため包み直す。
Rails.application.config.after_initialize do
  verifier = OmniAuth::RailsCsrfProtection::TokenVerifier.new
  OmniAuth.config.request_validation_phase = lambda do |env|
    # verifierはenvを複製してbodyを読むため、元のenvに解釈結果が残らない。先にここで解釈して残し、
    # 後のbefore_request_phaseがintent・return_toを読めるようにする。
    Rack::Request.new(env).POST
    verifier.call(env)
  rescue ActionController::InvalidAuthenticityToken => e
    raise OmniAuth::AuthenticityError, e.message
  end
end

OmniAuth.config.on_failure = lambda do |env|
  Auth::GoogleCallbacksController.action(:failure).call(env)
end

# 求めるのは本人の識別（sub）と確認済みメールだけ。Googleのtokenは保存せず、refresh tokenも求めない。
module GoogleOauthOptions
  AUTHORIZE = { scope: "openid,email", prompt: "select_account", access_type: "online" }.freeze
end

Rails.application.config.middleware.use OmniAuth::Builder do
  provider OmniAuth::Strategies::FocusGoogleOauth2,
           ENV.fetch("GOOGLE_CLIENT_ID", nil),
           ENV.fetch("GOOGLE_CLIENT_SECRET", nil),
           **GoogleOauthOptions::AUTHORIZE
end

# 開始の試行回数の制限は、CSRFの検証やGoogleへのredirectより先に数える。
Rails.application.config.middleware.insert_before OmniAuth::Builder, OmniAuth::GoogleStartThrottle
