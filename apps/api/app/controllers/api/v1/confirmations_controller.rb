module Api
  module V1
    # 確認メールの再送と、確認tokenによるメールアドレスの確認（契約のresendConfirmation・confirmEmail）。
    class ConfirmationsController < ApplicationController
      def create
        input = require_strings(email: 254)
        return unless input

        result = AuthMailRequest.new(**input, ip: request.remote_ip).resend_confirmation
        result.status == :accepted ? head(:accepted) : render_result_problem(result)
      end

      def update
        input = require_strings(token: 256)
        return unless input

        result = AuthTokenRedemption.new(**input).confirm_email
        result.status == :ok ? head(:no_content) : render_result_problem(result)
      end
    end
  end
end
