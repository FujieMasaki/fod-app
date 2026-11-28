# 定期実行（config/recurring.yml）。期限の到来と、再実行が要る後片付けを拾い直す。
class GenerationMaintenanceJob < ApplicationJob
  def perform
    now = Time.current
    GenerationExpiry.sweep(now:)
    GenerationCleanupSweep.sweep(now:)
    ConsumedRecordingAttempt.expired(now).delete_all
  end
end
