module Api
  module V1
    # 解除メールのリンクからロックを解く（契約のunlockAccount）。
    class UnlocksController < ApplicationController
      def update
        input = require_strings(token: 256)
        return unless input

        result = AuthTokenRedemption.new(**input).unlock_account
        result.status == :ok ? head(:no_content) : render_result_problem(result)
      end
    end
  end
end
