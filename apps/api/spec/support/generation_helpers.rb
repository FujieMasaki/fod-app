# 処理の記録と、それが指すS3のobject・Transcribeのjobを偽物のproviderに用意する。
module GenerationHelpers
  # 現在の試行の音声と、文字起こし結果・終端のjob（文字起こしを始めていれば）を置く
  def seed_resources(generation)
    storage.objects[generation.audio_key] = { body: "audio" }
    return unless generation.transcription_attempt.positive?

    transcriber.jobs[generation.transcription_job_name] = { status: :completed, output_key: generation.transcript_key }
    storage.objects[generation.transcript_key] = { body: "{}" }
  end

  def resource_keys(generation) = storage.keys.select { it.include?(generation.id) }
  def job_names(generation) = transcriber.jobs.keys.select { it.start_with?(generation.id) }
end

RSpec.configure { it.include GenerationHelpers }
