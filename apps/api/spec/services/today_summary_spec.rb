require "rails_helper"

RSpec.describe TodaySummary do
  let(:user) { create(:user) }
  let(:now) { Time.zone.parse("2026-09-28 12:00:00 +09:00") }

  def dot_at(time, **attributes) = create(:dot, user:, started_at: Time.zone.parse(time), **attributes)

  def call = described_class.new(user:, now:).call

  it "今日のゴミ箱の外の本人のDotの件数と、最新のDotを組みで返す" do
    dot_at("2026-09-28 00:00:00 +09:00")
    latest = dot_at("2026-09-28 11:00:00 +09:00")
    dot_at("2026-09-28 11:30:00 +09:00", trashed_at: Time.current)
    dot_at("2026-09-27 23:59:59 +09:00")
    create(:dot, started_at: Time.zone.parse("2026-09-28 11:45:00 +09:00"))

    result = call

    expect([result.date, result.dot_count, result.latest_dot]).to eq([Date.new(2026, 9, 28), 2, latest])
  end

  it "今日のDotが全部ゴミ箱の中なら、件数0で最新のDotを持たない" do
    dot_at("2026-09-28 08:00:00 +09:00", trashed_at: Time.current)

    result = call

    expect([result.dot_count, result.latest_dot]).to eq([0, nil])
  end
end
