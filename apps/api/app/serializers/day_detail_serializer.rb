# 契約のDayDetail。その日のDotが0件でも`dots: []`で返す（取得失敗と区別する）。
class DayDetailSerializer
  def initialize(page)
    @page = page
  end

  def as_json(*)
    { date: @page.date.iso8601, dots: @page.dots.map { DotSerializer.new(it).as_json }, next_cursor: @page.next_cursor }
  end
end
