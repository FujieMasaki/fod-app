module Api
  module V1
    # 認証状態の取得・login・logout（契約のgetSession・createSession・deleteSession）。
    class SessionsController < ApplicationController
      # 未認証でも200を返す。CSRF tokenはここで受け取る。
      def show
        render_session(authenticated_user_or_nil)
      end

      def create
        input = require_strings(email: 254, password: 128)
        return unless input

        result = PasswordSignIn.new(**input, ip: request.remote_ip).call
        result.status == :ok ? render_signed_in(result.user) : render_result_problem(result)
      end

      # CookieStoreのため、コピー済みCookieの即時失効は保証しない。未認証でも204。
      def destroy
        end_session
        head :no_content
      end

      private

      def render_signed_in(user)
        start_session(user)
        render_session(user)
      end

      def render_session(user)
        render json: SessionSerializer.new(user:, csrf_token: form_authenticity_token, expires_at: session_expires_at)
      end
    end
  end
end
