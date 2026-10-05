# 指定した日の本人のDotを、`started_at`の降順（同値なら`id`の降順）で返す（契約のgetDay）。
#
# その時点でゴミ箱の外にあるDotだけを対象にする（`kept`を明示する）。0件でも失敗にしない。
# 続きは最後に返したDotの位置のcursorで返す（同日の件数に上限が無いため）。
class DayDots
  DEFAULT_LIMIT = 50

  Page = Data.define(:date, :dots, :next_cursor)

  def initialize(user:, date:, cursor:, limit:)
    @user = user
    @date = date
    @cursor = cursor
    @limit = limit
  end

  def call
    rows = dots.limit(@limit + 1).to_a
    page = rows.first(@limit)
    next_cursor = HistoryCursor.for_dot(page.last) if rows.size > @limit
    Page.new(date: @date, dots: page, next_cursor:)
  end

  private

  def dots
    scope = @user.dots.kept.on_date(@date).newest_first
    return scope unless @cursor

    started_at, id = HistoryCursor.after_dot(@cursor, date: @date)
    scope.where("(dots.started_at, dots.id) < (?, ?)", started_at, id)
  end
end
