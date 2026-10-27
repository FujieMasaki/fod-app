require "rails_helper"

RSpec.describe RecordingAttemptToken do
  let(:user) { create(:user) }

  it "attemptのid・利用者・started_at・期限（発行から2時間）を、暗号化・署名したtokenに入れる" do
    travel_to(Time.zone.parse("2026-10-24 10:00:00.123456 UTC")) do
      attempt, token = described_class.issue(user)

      expect(token).not_to include(user.id)
      expect(described_class.verify(token, user)).to eq(attempt)
      expect(attempt).to have_attributes(started_at: Time.current, expires_at: 2.hours.from_now)
      expect(token.bytesize).to be <= 1024
    end
  end

  it "マイクロ秒より細かい時刻で発行しても、返すattemptはtokenから読んだものと同じ" do
    attempt, token = described_class.issue(user, now: Time.zone.parse("2026-10-24 10:00:00.123456789 UTC"))

    expect(described_class.verify(token, user)).to eq(attempt)
    expect(attempt.started_at).to eq(Time.zone.parse("2026-10-24 10:00:00.123456 UTC"))
  end

  it "発行するidはUUID v4で、毎回違う" do
    ids = Array.new(20) { described_class.issue(user).first.id }

    expect(ids).to all(match(/\A\h{8}-\h{4}-4\h{3}-[89ab]\h{3}-\h{12}\z/))
    expect(ids.uniq.size).to eq(20)
  end

  it "別の利用者のattempt・改ざんした値・形の違う値は不正として拒否する" do
    _, token = described_class.issue(user)

    [[token, create(:user)], ["#{token}x", user], ["", user], [nil, user]].each do |value, verifier|
      expect { described_class.verify(value, verifier) }.to raise_error(RecordingAttemptToken::Invalid)
    end
  end

  it "期限切れは不正と区別できる（録り直しの案内のため）" do
    _, token = described_class.issue(user)

    travel(2.hours + 1.second) do
      expect(described_class.verify(token, user).expired?).to be(true)
    end
  end
end
