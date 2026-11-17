require "rails_helper"

RSpec.describe ConsumedRecordingAttempt do
  let(:id) { SecureRandom.uuid }

  it "期限が残っていれば記録し、期限まで使用済みとして扱う" do
    described_class.record(id, expires_at: 1.hour.from_now)

    expect(described_class.consumed?(id)).to be(true)
    expect(described_class.consumed?(id, 2.hours.from_now)).to be(false)
  end

  it "期限が過ぎたattemptは記録しない（attempt自体が使えないため）" do
    described_class.record(id, expires_at: 1.second.ago)

    expect(described_class.exists?(id)).to be(false)
  end

  it "同じattemptを2回記録しても1行のまま" do
    2.times { described_class.record(id, expires_at: 1.hour.from_now) }

    expect(described_class.where(id:).count).to eq(1)
  end
end
