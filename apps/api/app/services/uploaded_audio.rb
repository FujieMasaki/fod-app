# `POST /api/v1/dots`で送られた音声（契約のDotUpload）。形式・大きさ・録音時間を検証する。
# partのContent-Typeはclientの申告なので、中身の先頭（webmはEBML、mp4は`ftyp`）でも確かめる。
UploadedAudio = Data.define(:io, :content_type, :size, :duration_seconds) do
  # 契約のerror code。問題が無ければnil
  def problem
    return :validation_failed unless duration_seconds.is_a?(Integer) && Dot::DURATION_RANGE.cover?(duration_seconds)
    return :audio_too_large if size > UploadedAudio::MAX_BYTES

    :unsupported_audio_type unless TranscriptionGateway::MEDIA_FORMATS.key?(content_type) && signature_matches?
  end

  def signature_matches?
    head = io.read(12).to_s.b
    io.rewind
    case content_type
    when "audio/webm" then head.start_with?("\x1A\x45\xDF\xA3".b)
    when "audio/mp4" then head[4, 4] == "ftyp"
    end
  end
end
UploadedAudio::MAX_BYTES = 32.megabytes
