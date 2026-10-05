# 契約のDayList。`today`はserverが決めた今日の日付（「今日」のラベルに使う）。
class DayListSerializer
  def initialize(page, today:)
    @page = page
    @today = today
  end

  def as_json(*)
    {
      today: @today.iso8601,
      items: @page.items.map do |item|
        { date: item.date.iso8601, dot_count: item.dot_count, latest_dot_id: item.latest_dot_id }
      end,
      next_cursor: @page.next_cursor
    }
  end
end
