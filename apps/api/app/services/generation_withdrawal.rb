# 退会と進行中の処理の排他（TASK-003 Plan §20「退会と進行中処理の排他」）。退会のendpointと、Dot・利用者の行の
# 削除はTASK-013が行い、ここを呼ぶ。
#
# - 受理: 利用者の行をlockして受理時刻を書き、世代番号を1増やす。同じtransactionで本人の全処理を後片付けへ回す。
#   以後、記録の作成・再試行・結果の確定は、利用者の行のlockの中で受理時刻と世代を見て止まる。
# - `uploading`の記録は消さずに取り消しとして残す。uploaderか後片付けが、後から完成したobjectまで回収する。
# - 完了: 本人の処理の記録が0になったとき（Transcribeの非終端のjobを含め、後片付けが全部終わったとき）。
module GenerationWithdrawal
  module_function

  def accept(user, now: Time.current)
    ActiveRecord::Base.transaction do
      locked = User.lock.find(user.id)
      locked.update!(deletion_requested_at: now, generation: locked.generation + 1) unless locked.deletion_requested?
      cancel_all(locked, now)
      consume_attempts(locked, now)
    end
  end

  # 進行中の処理（upload・Transcribeのjob・後片付けのいずれか）が0になったか
  def settled?(user) = !user.generations.exists?

  def cancel_all(user, now)
    user.generations.where(state: GenerationCancellation::FROM.fetch("withdrawn")).find_each do |generation|
      GenerationCancellation.request(user_id: user.id, generation_id: generation.id, reason: "withdrawn", now:)
    rescue GenerationGate::Denied
      # 読んだ後に後片付けへ進んだ記録。1件の競合で受理全体を巻き戻さない（後片付けは別に進む）
      nil
    end
  end

  # 消したものが同じattemptで作り直されないよう、期限の残るattemptのidを残す（privacy.md §5-1）
  def consume_attempts(user, now)
    live_since = now - Generation::ATTEMPT_LIFETIME
    ids = user.generations.where(started_at: live_since..).pluck(:id, :started_at) +
          user.dots.where(started_at: live_since..).pluck(:generation_id, :started_at)
    ids.each { |id, started_at| ConsumedRecordingAttempt.record(id, expires_at: started_at + Generation::ATTEMPT_LIFETIME, now:) }
  end
  private_class_method :cancel_all, :consume_attempts
end
