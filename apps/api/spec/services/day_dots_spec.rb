require "rails_helper"

RSpec.describe DayDots do
  let(:user) { create(:user) }
  let(:date) { Date.new(2026, 9, 28) }

  def dot_at(time, **attributes) = create(:dot, user:, started_at: Time.zone.parse(time), **attributes)

  def call(cursor: nil, limit: 50) = described_class.new(user:, date:, cursor:, limit:).call

  it "その日のゴミ箱の外の本人のDotを、started_atの降順で返す" do
    morning = dot_at("2026-09-28 08:00:00 +09:00")
    evening = dot_at("2026-09-28 22:00:00 +09:00")
    dot_at("2026-09-28 12:00:00 +09:00", trashed_at: Time.current)
    dot_at("2026-09-29 00:00:00 +09:00")
    create(:dot, started_at: Time.zone.parse("2026-09-28 09:00:00 +09:00"))

    page = call

    expect(page.dots).to eq([evening, morning])
    expect(page.next_cursor).to be_nil
  end

  it "その日のDotが全部ゴミ箱の中なら0件で返す（失敗にしない）" do
    dot_at("2026-09-28 08:00:00 +09:00", trashed_at: Time.current)

    expect(call.dots).to eq([])
  end

  it "同日の多数のDotを続きでたどると、started_atが同じものを含めて欠落も重複もなく返す" do
    same_time = Array.new(3) { dot_at("2026-09-28 12:00:00 +09:00") }
    others = (0...6).map { dot_at(format("2026-09-28 %02d:30:00 +09:00", it)) }
    expected = (same_time + others).sort_by { [it.started_at, it.id] }.reverse

    collected = []
    cursor = nil
    loop do
      page = call(cursor:, limit: 2)
      collected.concat(page.dots)
      break unless (cursor = page.next_cursor)
    end

    expect(collected).to eq(expected)
  end

  it "続きの途中でDotがゴミ箱へ移っても、残りのDotを欠落させない" do
    dots = (0...4).map { dot_at(format("2026-09-28 %02d:00:00 +09:00", it + 1)) }.reverse
    first = call(limit: 2)
    dots.first.update!(trashed_at: Time.current)

    expect(call(cursor: first.next_cursor, limit: 2).dots).to eq(dots.last(2))
  end
end
