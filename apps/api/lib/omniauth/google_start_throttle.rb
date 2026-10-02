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
      return @app.call(env) unless request.post? && request.path == PATH
      return @app.call(env) if limiter.hit(request.remote_ip).allowed?

      [302, { "location" => redirect_location(request), "cache-control" => "no-store" }, []]
    end

    private

    # 再読込されるclassなので、呼ばれた時点で作る。
    def limiter = RateLimiter.new(name: "google_start_ip", limit: LIMIT, period: PERIOD)

    def redirect_location(request)
      intent = GoogleAuthIntent.from_params(Rack::Request.new(request.env).POST)
      base = intent.reauthenticate? ? intent.return_to : "/login"
      "#{request.base_url}#{base}?auth_error=rate_limited"
    end
  end
end
