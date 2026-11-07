FactoryBot.define do
  factory :generation do
    user
    id { SecureRandom.uuid }
    started_at { Time.zone.parse("2026-10-24 00:00:00") }
    duration_seconds { 120 }
    audio_content_type { "audio/webm" }
    accepted_at { Time.current }
    retry_expires_at { accepted_at + Generation::RETRY_WINDOW }
    state { Generation::UPLOADING }
    user_generation { user.generation }
    audio_key { GenerationNaming.audio_key(id, upload_attempt) }
    last_progress_at { Time.current }

    trait :transcribing do
      state { Generation::TRANSCRIBING }
      transcription_attempt { 1 }
      transcript_key { GenerationNaming.transcript_key(id, transcription_attempt) }
      transcription_job_name { GenerationNaming.job_name(id, transcription_attempt) }
    end

    trait :transcribed do
      transcribing
      transcript_ready_at { Time.current }
    end
  end
end
