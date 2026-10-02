FactoryBot.define do
  factory :user do
    sequence(:email) { |n| "user#{n}@example.com" }
    password { AuthRequestHelpers::DEFAULT_PASSWORD }
    confirmed_at { Time.current }

    trait :unconfirmed do
      confirmed_at { nil }
    end

    trait :google_only do
      password { nil }
      transient do
        google_uid { "google-#{SecureRandom.hex(8)}" }
      end
      identities { [UserIdentity.new(provider: User::GOOGLE_PROVIDER, uid: google_uid)] }
    end
  end
end
