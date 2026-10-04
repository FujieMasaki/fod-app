# 履歴の続きを取得するcursor（契約のCursor）。Webは中身を解釈しない不透明な文字列として扱う。
#
# - 中身は`v1:<値>`をBase64url（paddingなし）にしたもの。offsetやpage番号は使わない（dot-history.md §2）。
# - 利用者を含まない。作り替えられても、queryは常に`current_user.dots`の中だけを引く。
# - 解釈できない値は`Invalid`を投げる。controllerが`400 cursor_invalid`にする。
module HistoryCursor
  class Invalid < StandardError; end

  VERSION = "v1".freeze
  MAX_LENGTH = 512
  DATE_FORMAT = /\A\d{4}-\d{2}-\d{2}\z/
  MICROSECONDS_FORMAT = /\A\d{1,20}\z/
  UUID_FORMAT = /\A\h{8}-\h{4}-\h{4}-\h{4}-\h{12}\z/

  module_function

  # 日単位の一覧の続き。最後に返した日を持ち、続きはそれより前の日から返す。
  def for_day(date) = encode(date.iso8601)

  def after_day(cursor)
    date, = decode(cursor, size: 1)
    parse_date(date)
  end

  # 日の詳細の続き。最後に返したDotの`started_at`（マイクロ秒）と`id`、どの日のcursorかを持つ。
  def for_dot(dot) = encode(dot.date.iso8601, (dot.started_at.to_r * 1_000_000).to_i, dot.id)

  # 別の日のcursorは使い回させない（続きの位置が意味を持たないため）。
  def after_dot(cursor, date:)
    cursor_date, microseconds, id = decode(cursor, size: 3)
    raise Invalid unless parse_date(cursor_date) == date
    raise Invalid unless MICROSECONDS_FORMAT.match?(microseconds) && UUID_FORMAT.match?(id)

    [Time.zone.at(Rational(microseconds.to_i, 1_000_000)), id]
  end

  def encode(*values) = Base64.urlsafe_encode64([VERSION, *values].join(":"), padding: false)

  def decode(cursor, size:)
    raise Invalid unless cursor.is_a?(String) && cursor.length <= MAX_LENGTH

    version, *values = Base64.urlsafe_decode64(cursor).split(":", -1)
    raise Invalid unless version == VERSION && values.size == size

    values
  rescue ArgumentError
    raise Invalid
  end

  def parse_date(value)
    raise Invalid unless DATE_FORMAT.match?(value)

    Date.strptime(value, "%Y-%m-%d")
  rescue Date::Error
    raise Invalid
  end
end
