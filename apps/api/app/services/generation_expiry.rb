# 受理から24時間の再試行期限の到来（TASK-003 Plan §20のcleanupの契機「期限到来」）。その処理の全部を後片付けへ回す。
# 期限は再試行できる上限で、止まった処理の検知には使わない（それは状態ごとの判定。GenerationWatchdog）。
module GenerationExpiry
  module_function

  def sweep(now: Time.current)
    due = Generation.where(retry_expires_at: ..now)
    due.where(state: Generation::CANCELABLE_STATES).find_each { expire(it, now) }
    # Dotを保存済みの記録は取り消さず、全文を返さない印を付けて、残りの後片付けへ回す
    due.where(state: Generation::SUCCEEDED_CLEANUP_PENDING, transcript_withheld_at: nil).find_each { withhold(it, now) }
  end

  def expire(generation, now)
    GenerationCancellation.request(user_id: generation.user_id, generation_id: generation.id, reason: "expired", now:)
  rescue GenerationGate::Denied
    nil # 先に別の遷移が勝った。次の巡回で見直す
  end

  def withhold(generation, now)
    withheld = Generation.where(id: generation.id, state: Generation::SUCCEEDED_CLEANUP_PENDING,
                                transcript_withheld_at: nil)
                         .update_all(transcript_withheld_at: now, updated_at: now) # rubocop:disable Rails/SkipsModelValidations
    GenerationCleanupJob.perform_later(generation.id) if withheld == 1
  end
  private_class_method :expire, :withhold
end
