module Api
  module V1
    # メールアドレスとpasswordでの登録（契約のcreateRegistration）。登録済みでも同じ202。
    class RegistrationsController < ApplicationController
      def create
        input = require_strings(email: 254, password: 128)
        return unless input

        result = UserRegistration.new(**input, ip: request.remote_ip).call
        result.status == :accepted ? head(:accepted) : render_result_problem(result)
      end
    end
  end
end
