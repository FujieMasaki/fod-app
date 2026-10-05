require "rails_helper"

RSpec.describe DayList do
  let(:user) { create(:user) }

  def dot_on(date, hour: 3, **attributes)
    started_at = Time.zone.parse(format("%<date>s %<hour>02d:00:00 +09:00", date:, hour:))
    create(:dot, user:, started_at:, **attributes)
  end

  def call(cursor: nil, limit: 30) = described_class.new(user:, cursor:, limit:).call

  it "記録のある日だけを新しい順に、件数と最新のDotで1要素にまとめる" do
    morning = dot_on("2026-09-28", hour: 8)
    evening = dot_on("2026-09-28", hour: 22)
    other_day = dot_on("2026-09-25")

    page = call

    expect(page.items.map(&:to_h)).to eq(
      [{ date: Date.new(2026, 9, 28), dot_count: 2, latest_dot_id: evening.id },
       { date: Date.new(2026, 9, 25), dot_count: 1, latest_dot_id: other_day.id }]
    )
    expect(page.next_cursor).to be_nil
    expect(morning.started_at).to be < evening.started_at
  end

  it "ゴミ箱の中のDotは件数にも最新にも含めず、全部がゴミ箱の日は要素を返さない" do
    kept = dot_on("2026-09-28", hour: 8)
    dot_on("2026-09-28", hour: 22, trashed_at: Time.current)
    dot_on("2026-09-27", trashed_at: Time.current)

    expect(call.items.map(&:to_h)).to eq([{ date: Date.new(2026, 9, 28), dot_count: 1, latest_dot_id: kept.id }])
  end

  it "他人のDotを含めない" do
    create(:dot)

    expect(call.items).to eq([])
  end

  it "日をまたぐ0:00 JSTの前後を別の日にする" do
    dot_on("2026-09-27", hour: 23)
    create(:dot, user:, started_at: Time.zone.parse("2026-09-28 00:00:00 +09:00"))

    expect(call.items.map(&:date)).to eq([Date.new(2026, 9, 28), Date.new(2026, 9, 27)])
  end

  it "続きを最後までたどると、すべての日を欠落も重複もなく1回ずつ返す" do
    dates = (0...7).map { Date.new(2026, 9, 1) + (it * 3) }
    dates.each { |date| [3, 9].each { |hour| dot_on(date.iso8601, hour:) } }

    collected = []
    cursor = nil
    loop do
      page = call(cursor:, limit: 3)
      collected.concat(page.items.map(&:date))
      break unless (cursor = page.next_cursor)
    end

    expect(collected).to eq(dates.reverse)
  end

  it "ちょうどlimit件で終わるときはnext_cursorを返さない" do
    dot_on("2026-09-28")
    dot_on("2026-09-27")

    expect(call(limit: 2).next_cursor).to be_nil
  end

  it "取得の間に新しいDotが増えても、続きで既に返した日を繰り返さない" do
    %w[2026-09-28 2026-09-27 2026-09-26].each { dot_on(it) }
    first = call(limit: 2)
    dot_on("2026-09-29")

    expect(call(cursor: first.next_cursor, limit: 2).items.map(&:date)).to eq([Date.new(2026, 9, 26)])
  end
end
