# 再実行が要る後片付けを拾い、GenerationCleanupJobへ渡す。後片付けを再実行する唯一の契機で、失敗・終端待ちの
# Jobは自分で積み直さない（積み直しの連鎖が増え続けないようにするため）。
# - cancel_requested: 後片付けがまだ始まっていない
# - cleanup_pending・succeeded_cleanup_pending: 実行権の期限が切れている（失敗・終端待ち・実行中に落ちた）
# - succeeded_cleanup_pending: 全文を返さない印が付き、実行権を誰も持っていない（ACK・期限の後のJobが落ちた）
module GenerationCleanupSweep
  module_function

  def sweep(now: Time.current)
    due(now).pluck(:id).each { GenerationCleanupJob.perform_later(it) }
  end

  def due(now)
    lease_lapsed = Generation.where(state: [Generation::CLEANUP_PENDING, Generation::SUCCEEDED_CLEANUP_PENDING],
                                    lease_expires_at: ..now)
    unowned_withheld = Generation.where(state: Generation::SUCCEEDED_CLEANUP_PENDING, lease_expires_at: nil)
                                 .where.not(transcript_withheld_at: nil)
    Generation.where(state: Generation::CANCEL_REQUESTED).or(lease_lapsed).or(unowned_withheld)
  end
end
