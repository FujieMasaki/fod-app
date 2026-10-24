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

# 送られる音声（先頭のbyteだけ本物の形式に合わせる）
module UploadHelpers
  WEBM_HEAD = "\x1A\x45\xDF\xA3".b
  MP4_HEAD = "\x00\x00\x00\x18ftypM4A ".b

  def uploaded_audio(content_type: "audio/webm", body: nil, duration_seconds: 120, size: nil)
    body ||= (content_type == "audio/mp4" ? MP4_HEAD : WEBM_HEAD) + ("\x00".b * 64)
    UploadedAudio.new(io: StringIO.new(body), content_type:, size: size || body.bytesize, duration_seconds:)
  end
end

RSpec.configure { it.include UploadHelpers }
