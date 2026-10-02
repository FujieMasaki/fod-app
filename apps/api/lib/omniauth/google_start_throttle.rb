module OmniAuth
  # Googleログインの開始（POST /auth/google_oauth2）の試行回数をIPごとに制限する（TASK-006 Plan §12-6）。
  # 開始はform POSTでbrowserが遷移するため、JSONの429ではなく`auth_error=rate_limited`を付けて
  # redirectする（契約のstartGoogleAuth）。戻り先はintent=sign_inなら/login、reauthenticateならreturn_to。
  class GoogleStartThrottle
    PATH = "/auth/google_oauth2".freeze
    LIMIT = 50
    PERIOD = 1.hour

    def initialize(app)
      @app = app
    end

    def call(env)
      request = ActionDispatch::Request.new(env)
      return @app.call(env) unless request.post? && start_path?(request)

      status, headers, body =
        if limiter.hit(request.remote_ip).allowed?
          @app.call(env)
        else
          [302, { "location" => redirect_location(request) }, []]
        end
      # OAuthのstateを含むGoogleへのredirectも、制限に掛かったredirectもcacheさせない。
      headers["cache-control"] = "no-store"
      [status, headers, body]
    end

    private

    # OmniAuthと同じ正規化（小文字にし、末尾の`/`を除く）で比べる。表記を変えて制限を迂回させないため。
    def start_path?(request) = request.path.downcase.delete_suffix("/") == PATH

    # 再読込されるclassなので、呼ばれた時点で作る。
    def limiter = RateLimiter.new(name: "google_start_ip", limit: LIMIT, period: PERIOD)

    def redirect_location(request)
      intent = GoogleAuthIntent.from_params(Rack::Request.new(request.env).POST)
      base = intent.reauthenticate? ? intent.return_to : "/login"
      "#{request.base_url}#{base}?auth_error=rate_limited"
    end
  end
end
