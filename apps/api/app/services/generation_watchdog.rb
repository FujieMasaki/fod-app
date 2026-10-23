# 止まった処理を状態ごとに検知して回収する（TASK-003 Plan §19「止まったJobの検知」）。最終進捗時刻だけで
# 再実行せず、実行権が切れてからも一定時間たったものだけを拾う（生きている実行・Transcribeの待ちを二重に動かさない）。
#
# - uploading: Jobがまだ無いのでSolid Queueは知らない。`HeadObject`で実体を見て、完成していれば確定（T1）、
#   無ければ`upload_failed`（T2）にする
# - accepted: 文字起こしの開始をenqueueし直す
# - transcribing: 完了待ちをenqueueし直す（AWS側の状態を`GetTranscriptionJob`で見る）
# - generating: 生成をenqueueし直す（外部AIの消費は繰り返される。TASK-003 Plan §13）
module GenerationWatchdog
  STALE_AFTER = 2.minutes

  module_function

  def sweep(now: Time.current)
    stale = stale(now)
    stale.where(state: Generation::UPLOADING).find_each { inspect_upload(it, now) }
    stale.where(state: Generation::ACCEPTED).pluck(:id).each { GenerationTranscribeJob.perform_later(it) }
    stale.where(state: Generation::TRANSCRIBING).pluck(:id).each { GenerationTranscriptionCheckJob.perform_later(it) }
    stale.where(state: Generation::GENERATING).pluck(:id).each { GenerationComposeJob.perform_later(it) }
  end

  def stale(now)
    threshold = now - STALE_AFTER
    lapsed = Generation.where(lease_expires_at: nil).or(Generation.where(lease_expires_at: ...threshold))
    Generation.where(last_progress_at: ...threshold).merge(lapsed)
  end

  def inspect_upload(generation, now)
    token = Generation.acquire_lease(generation.id, state: Generation::UPLOADING,
                                                    duration: GenerationUpload::LEASE_DURATION, now:)
    return unless token

    if GenerationProviders.storage.exists?(generation.audio_key)
      GenerationUploadCompletion.complete(generation.id, token)
    else
      GenerationUploadCompletion.fail(generation.id, token)
    end
  rescue GenerationProviders::Error
    Generation.release_lease(generation.id, token)
  end
  private_class_method :stale, :inspect_upload
end
