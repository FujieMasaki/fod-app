# 文字起こし全文の受領通知（ACK。TASK-003 Plan §27）。端末が全文を保存し終えたら呼ばれ、以後この処理の全文を返さず、
# 文字起こし結果とTranscribeのjobの後片付けを始める。ACKそのものは保存しない（記録の印は後片付けの後に消える）。
# 状態は変えない（ACKは遷移を伴わない）。
module TranscriptAcknowledgement
  module_function

  # 認可は`current_user.dots`と`(user_id, 処理ID)`の両方。ゴミ箱の中のDotは示さない。
  # 結果はSymbol: :accepted / :not_found / :account_deletion_in_progress
  def acknowledge(user:, generation_id:, now: Time.current)
    return :account_deletion_in_progress if user.deletion_requested?
    return :not_found unless user.dots.kept.exists?(generation_id:)

    withheld = Generation.where(id: generation_id, user_id: user.id, state: Generation::SUCCEEDED_CLEANUP_PENDING,
                                transcript_withheld_at: nil)
                         .update_all(transcript_withheld_at: now, updated_at: now) # rubocop:disable Rails/SkipsModelValidations
    GenerationCleanupJob.perform_later(generation_id) if withheld == 1
    # 対象が既に無い・既に受け取った場合も、本人の処理なら同じ結果にする（重複・並行・遅れて届いたACK）
    :accepted
  end
end
