# 記録のある日を新しい順に、1日1要素で返す（契約のlistDays）。
#
# ゴミ箱の中のDotは日の集約にも件数にも含めない（`kept`を明示する）。1要素は日付・件数・最新Dotのidの
# 固定サイズで、同日の全Dotは日の詳細で取得する。続きは日付のcursorで返すため、同日がページの境界で
# 分断されない。
class DayList
  DEFAULT_LIMIT = 30
  LATEST_DOT_ID = Arel.sql("(array_agg(dots.id ORDER BY dots.started_at DESC, dots.id DESC))[1]")

  Item = Data.define(:date, :dot_count, :latest_dot_id)
  Page = Data.define(:items, :next_cursor)

  def initialize(user:, cursor:, limit:)
    @user = user
    @cursor = cursor
    @limit = limit
  end

  def call
    rows = days.limit(@limit + 1).pluck(:date, Arel.sql("COUNT(*)"), LATEST_DOT_ID)
    items = rows.first(@limit).map { |date, dot_count, latest_dot_id| Item.new(date:, dot_count:, latest_dot_id:) }
    next_cursor = HistoryCursor.for_day(items.last.date) if rows.size > @limit
    Page.new(items:, next_cursor:)
  end

  private

  def days
    scope = @user.dots.kept
    scope = scope.where(date: ...HistoryCursor.after_day(@cursor)) if @cursor
    scope.group(:date).order(date: :desc)
  end
end
