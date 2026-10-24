module Api
  module V1
    # 生成の状態の取得・取り消し・再試行・文字起こし全文の受領通知（契約のgeneration tag）。
    # 認可は常に`current_user`の処理の記録とDotで行い、処理IDを知っていることを権限にしない。
    class GenerationsController < ApplicationController
      before_action :authenticate_user!
      before_action :reject_during_account_deletion

      # polling
      def show
        render_generation(status: :ok)
      end

      # 処理の取り消し。受け付けたことを返し、消え終わったことは返さない
      def destroy
        respond_with(GenerationCancellation.cancel_by_user(user: current_user, generation_id:))
      end

      def retry
        retry_after = GenerationThrottle.hit(:retry, current_user)
        return render_problem(:rate_limited, retry_after_seconds: retry_after) if retry_after

        result = GenerationRetry.call(user: current_user, generation_id:)
        return render_generation(status: :accepted) if result == :accepted
        return render_problem(result) unless result == :retry_expired

        render_problem(:retry_expired, retry_expires_at: current_user.generations.find(generation_id)
                                                                     .retry_expires_at.utc.iso8601)
      end

      # 文字起こし全文の受領通知（ACK）。何度呼んでも結果は変わらない
      def acknowledge_transcript
        respond_with(TranscriptAcknowledgement.acknowledge(user: current_user, generation_id:))
      end

      private

      def generation_id = params.expect(:generation_id)

      def reject_during_account_deletion
        render_problem(:account_deletion_in_progress) if current_user.deletion_requested?
      end

      def respond_with(result)
        result == :accepted ? head(:accepted) : render_problem(result)
      end

      def render_generation(status:)
        view = GenerationStatus.lookup(user: current_user, generation_id:)
        return render_problem(:not_found) unless view

        render json: GenerationSerializer.new(view), status:
      end
    end
  end
end
