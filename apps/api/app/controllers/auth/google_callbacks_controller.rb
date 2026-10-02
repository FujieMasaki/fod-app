module Auth
  # Googleからのcallback（契約のgoogleAuthCallback）。JSON APIではなく、結果を付けてSPAへredirectする。
  # 失敗の理由は`auth_error=<理由>`で渡す（理由の一覧は`contracts/README.md` §5）。
  class GoogleCallbacksController < ApplicationController
    SIGN_IN_ERRORS = { email_conflict: "google_email_conflict" }.freeze
    REAUTHENTICATION_ERRORS = { mismatch: "google_reauthentication_mismatch" }.freeze

    # callbackはGoogleからのGET。認証応答とstateはOmniAuthが検証済み。
    # failureは開始POSTのCSRF不一致からも呼ばれ、その場合は下で`403 csrf_invalid`を返す。
    skip_forgery_protection

    # browserが遷移してくる画面なので、想定外の失敗もJSONではなくログイン画面へ戻す。
    rescue_from StandardError do |error|
      Rails.error.report(error, handled: true)
      redirect_to "/login?auth_error=google_auth_failed"
    end

    def create
      intent = take_intent
      auth = request.env["omniauth.auth"]
      return redirect_with_error(intent, "google_auth_failed") unless auth

      intent.reauthenticate? ? reauthenticate(intent, auth) : sign_in_with(intent, auth)
    end

    def failure
      return render_problem(:csrf_invalid) if request.env["omniauth.error"].is_a?(OmniAuth::AuthenticityError)

      redirect_with_error(take_intent, "google_auth_failed")
    end

    private

    def sign_in_with(intent, auth)
      result = GoogleSignIn.new(auth).sign_in
      return redirect_with_error(intent, SIGN_IN_ERRORS.fetch(result.status, "google_auth_failed")) unless
        result.status == :ok

      start_session(result.user)
      redirect_to intent.return_to
    end

    # sessionも認証の期限も変えず、再認証した時刻だけを記録する。
    def reauthenticate(intent, auth)
      user = authenticated_user_or_nil
      return redirect_to("/login?auth_error=google_auth_failed") unless user

      result = GoogleSignIn.new(auth).reauthenticate(user)
      return redirect_with_error(intent, REAUTHENTICATION_ERRORS.fetch(result.status, "google_auth_failed")) unless
        result.status == :ok

      record_google_reauthentication
      redirect_to intent.return_to
    end

    # loginしたままの再認証はreturn_toへ、それ以外は/loginへ戻す。
    def redirect_with_error(intent, reason)
      base = intent.reauthenticate? && authenticated_user_or_nil ? intent.return_to : "/login"
      redirect_to "#{base}?auth_error=#{reason}"
    end

    def take_intent = GoogleAuthIntent.from_session(session.delete(GoogleAuthIntent::SESSION_KEY))
  end
end
