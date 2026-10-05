# 契約のToday。今日の記録が無ければ`dot_count: 0`で`latest_dot`を省く（取得失敗と区別する）。
class TodaySerializer
  def initialize(summary)
    @summary = summary
  end

  def as_json(*)
    json = { date: @summary.date.iso8601, dot_count: @summary.dot_count }
    json[:latest_dot] = DotSerializer.new(@summary.latest_dot).as_json if @summary.latest_dot
    json
  end
end
