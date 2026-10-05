# 契約のDot。返す項目を明示し、所有者・処理ID・ゴミ箱の状態・作成更新時刻を返さない。
class DotSerializer
  def initialize(dot)
    @dot = dot
  end

  def as_json(*)
    {
      id: @dot.id,
      date: @dot.date.iso8601,
      started_at: @dot.started_at.utc.iso8601,
      duration_seconds: @dot.duration_seconds,
      sentence: @dot.sentence,
      summary: @dot.summary
    }
  end
end
