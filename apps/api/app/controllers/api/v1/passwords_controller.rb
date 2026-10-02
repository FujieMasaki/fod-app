module Api
  module V1
    # password再設定メールの要求と、再設定tokenによる再設定（契約のrequestPasswordReset・resetPassword）。
    class PasswordsController < ApplicationController
      def create
        input = require_strings(email: 254)
        return unless input

        result = AuthMailRequest.new(**input, ip: request.remote_ip).request_password_reset
        result.status == :accepted ? head(:accepted) : render_result_problem(result)
      end

      def update
        input = require_strings(token: 256, password: 128)
        return unless input

        result = AuthTokenRedemption.new(token: input[:token]).reset_password(input[:password])
        result.status == :ok ? head(:no_content) : render_result_problem(result)
      end
    end
  end
end
