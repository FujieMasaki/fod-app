# Dotの完全削除の受理（TASK-003 Plan §20のcleanupの契機「Dotの完全削除」）。endpointとDotの行の削除はTASK-013が行い、
# ここを呼ぶ。消す範囲は**そのDotを作った処理の分だけ**で、同じ利用者の他の録音（生成中・再試行待ち）には触れない。
module GenerationDotPurge
  module_function

  def accept(user:, dot:, now: Time.current)
    raise ArgumentError, "dot belongs to another user" unless dot.user_id == user.id

    ConsumedRecordingAttempt.record(dot.generation_id, expires_at: dot.started_at + Generation::ATTEMPT_LIFETIME, now:)
    generation = user.generations.find_by(id: dot.generation_id, state: Generation::SUCCEEDED_CLEANUP_PENDING)
    return unless generation

    GenerationCancellation.request(user_id: user.id, generation_id: generation.id, reason: "dot_purged", now:)
  rescue GenerationGate::Denied
    nil # 後片付けが先に終わり記録が消えた、または退会で取り消し済み。消すものは別の後片付けが持つ
  end
end
