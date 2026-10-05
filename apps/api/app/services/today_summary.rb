# Dayに出す今日（Asia/Tokyo）の状態（契約のgetToday）。今日の日付はserverが決める。
#
# ゴミ箱の中のDotは選ばない（`kept`を明示する）。件数と最新のDotを1つのqueryで取り、途中でDotが
# ゴミ箱へ移っても「件数はあるのに最新のDotが無い」組み合わせを返さないようにする。
class TodaySummary
  Result = Data.define(:date, :dot_count, :latest_dot)

  def initialize(user:, now: Time.current)
    @user = user
    @date = Dot.date_for(now)
  end

  def call
    latest_dot = @user.dots.kept.on_date(@date).newest_first.with_total_count.first
    Result.new(date: @date, dot_count: latest_dot ? latest_dot.total_count : 0, latest_dot:)
  end
end
