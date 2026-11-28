# 止まった処理を状態ごとに検知して回収する（TASK-003 Plan §19「止まったJobの検知」）。最終進捗時刻だけで
# 再実行せず、実行権が切れてからも一定時間たったものだけを拾う（生きている実行・Transcribeの待ちを二重に動かさない）。
#
# - uploading: Jobがまだ無いのでSolid Queueは知らない。`HeadObject`で実体を見て、完成していれば確定（T1）、
#   無ければ`upload_failed`（T2）にする
# - accepted: 文字起こしの開始をenqueueし直す
# - transcribing: 完了待ちをenqueueし直す（AWS側の状態を`GetTranscriptionJob`で見る）。最終進捗が古くても
#   watchdogは失敗にしない（Transcribeが終わっていれば結果を捨てて、有料でやり直させるため）。打ち切りは、完了待ちが
#   外部の失敗を受けたときにGenerationTranscriptionが判断する
# - generating: 生成をenqueueし直す（外部AIの消費は繰り返される。TASK-003 Plan §13）。最終進捗からGIVE_UP_AFTERを
#   過ぎたものは、拾い直さずに再試行できる失敗にする（想定外の例外で落ち続ける処理を、期限の24時間まで外部AIへ
#   送り直し続けない。全文は残るので、再試行は生成から始まる）
module GenerationWatchdog
  STALE_AFTER = 2.minutes
  GIVE_UP_AFTER = GenerationTranscription::GIVE_UP_AFTER

  module_function

  def sweep(now: Time.current)
    stale = stale(now)
    stale.where(state: Generation::UPLOADING).find_each { inspect_upload(it, now) }
    stale.where(state: Generation::ACCEPTED).pluck(:id).each { GenerationTranscribeJob.perform_later(it) }
    stale.where(state: Generation::TRANSCRIBING).pluck(:id).each { GenerationTranscriptionCheckJob.perform_later(it) }
    sweep_generating(stale.where(state: Generation::GENERATING), now)
  end

  def sweep_generating(generating, now)
    threshold = now - GIVE_UP_AFTER
    generating.where(last_progress_at: ...threshold).find_each { give_up(it, now) }
    generating.where(last_progress_at: threshold..).pluck(:id).each { GenerationComposeJob.perform_later(it) }
  end

  def give_up(generation, now)
    token = Generation.acquire_lease(generation.id, state: Generation::GENERATING,
                                                    duration: GenerationGate::LEASE_DURATION, now:)
    return unless token
    return Generation.release_lease(generation.id, token) unless abandoned?(generation.reload, now)

    Rails.logger.warn("generation abandoned: generation_id=#{generation.id} state=#{Generation::GENERATING}")
    Generation.transition(generation.id, from: Generation::GENERATING, to: Generation::FAILED, holding: token,
                                         failure_kind: "generation_failed",
                                         lease_token: nil, lease_expires_at: nil)
  end

  def stale(now)
    threshold = now - STALE_AFTER
    lapsed = Generation.where(lease_expires_at: nil).or(Generation.where(lease_expires_at: ...threshold))
    Generation.where(last_progress_at: ...threshold).merge(lapsed)
  end

  # 拾った後に失敗と再試行を経ていれば、始め直したばかりの処理を失敗にしない
  def abandoned?(generation, now) = generation.last_progress_at < now - GIVE_UP_AFTER

  def inspect_upload(generation, now)
    token = Generation.acquire_lease(generation.id, state: Generation::UPLOADING,
                                                    duration: GenerationUpload::LEASE_DURATION, now:)
    return unless token

    # 拾った後に再送が始まっていれば、その試行のkeyを見る
    if GenerationProviders.storage.exists?(generation.reload.audio_key)
      GenerationUploadCompletion.complete(generation.id, token)
    else
      GenerationUploadCompletion.fail(generation.id, token)
    end
  rescue GenerationProviders::Error
    Generation.release_lease(generation.id, token)
  end
  private_class_method :stale, :sweep_generating, :give_up, :abandoned?, :inspect_upload
end
