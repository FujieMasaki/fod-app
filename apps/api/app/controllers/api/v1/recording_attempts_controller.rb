module Api
  module V1
    # 録音attemptの発行（契約のcreateRecordingAttempt）。受理した時刻が`started_at`になり、Dotの`date`はここから決まる。
    # serverはattemptを保存しない。
    class RecordingAttemptsController < ApplicationController
      before_action :authenticate_user!

      def create
        return render_problem(:account_deletion_in_progress) if current_user.deletion_requested?

        retry_after = GenerationThrottle.hit(:recording_attempt, current_user)
        return render_problem(:rate_limited, retry_after_seconds: retry_after) if retry_after

        attempt, token = RecordingAttemptToken.issue(current_user)
        render json: RecordingAttemptSerializer.new(attempt, token), status: :created
      end
    end
  end
end
