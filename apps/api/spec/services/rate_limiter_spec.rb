require "rails_helper"

RSpec.describe RateLimiter do
  subject(:limiter) { described_class.new(name: "spec", limit: 2, period: 1.hour) }

  it "枠の上限までは通し、超えたら待つ秒数を返す" do
    travel_to Time.zone.parse("2026-10-02 10:15:00") do
      expect([limiter.hit("a").allowed?, limiter.hit("a").allowed?]).to eq([true, true])

      result = limiter.hit("a")
      expect(result).not_to be_allowed
      expect(result.retry_after_seconds).to eq(45 * 60)
    end
  end

  it "checkは数えずに、次の1回が通るかを返す" do
    limiter.hit("a")

    expect(limiter.check("a")).to be_allowed
    limiter.hit("a")
    expect(limiter.check("a")).not_to be_allowed
  end

  it "keyごと・名前ごとに別に数える" do
    2.times { limiter.hit("a") }

    expect(limiter.hit("b")).to be_allowed
    expect(described_class.new(name: "other", limit: 2, period: 1.hour).hit("a")).to be_allowed
  end

  it "次の枠では数え直す" do
    2.times { limiter.hit("a") }
    travel 1.hour

    expect(limiter.hit("a")).to be_allowed
  end

  it "keyを生のまま保存しない" do
    limiter.hit("person@example.com")

    expect(RateLimitCounter.pluck(:key_digest)).to all(match(/\A\h{64}\z/))
  end

  it "期限の過ぎた記録を消す" do
    limiter.hit("a")
    travel 1.hour + 1.second

    expect { described_class.purge_expired! }.to change(RateLimitCounter, :count).from(1).to(0)
  end
end
