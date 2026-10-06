FactoryBot.define do
  factory :dot do
    user
    generation_id { SecureRandom.uuid }
    started_at { Time.zone.parse("2026-09-28 03:00:00") }
    duration_seconds { 120 }
    sentence { "少し早く起きられた。" }
    summary { "朝に散歩をした。" }

    trait :trashed do
      trashed_at { Time.current }
    end
  end
end
