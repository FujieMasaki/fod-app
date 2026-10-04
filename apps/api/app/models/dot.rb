# 録音1回から生まれる記録1件（dot-history.md §2）。本人だけが取得・編集できる。
#
# - `date`は`started_at`からDBが算出する生成列で、代入しない。保存時刻やclientの値を日付の根拠にしない。
# - ゴミ箱の中のDotは、取得する場所ごとに`kept`で明示して外す。`default_scope`は使わない
#   （暗黙の除外は、ゴミ箱の中が一覧へ漏れる事故と、ゴミ箱が空に見える事故の両方を起こしやすい）。
# - 編集前の値は保存しない（版も履歴も持たない）。
class Dot < ApplicationRecord
  # migrationの生成列（`date`）の式と同じ値にする。一致はspecで確かめている。
  TIME_ZONE = "Asia/Tokyo".freeze
  SENTENCE_MAX_LENGTH = 200
  SUMMARY_MAX_LENGTH = 2000
  DURATION_RANGE = (1..1800)

  belongs_to :user

  # 所有者・処理・録音の開始時刻と長さは、保存後に変えない（編集できるのは`sentence`と`summary`だけ）。
  attr_readonly :user_id, :generation_id, :started_at, :duration_seconds

  scope :kept, -> { where(trashed_at: nil) }
  scope :trashed, -> { where.not(trashed_at: nil) }
  scope :on_date, ->(date) { where(date:) }
  # 「最新」は`started_at`の降順、同値なら`id`の降順（契約のgetDay）
  scope :newest_first, -> { order(started_at: :desc, id: :desc) }

  validates :generation_id, presence: true
  validates :started_at, presence: true
  validates :duration_seconds, numericality: { only_integer: true, in: DURATION_RANGE }
  # 空文字を許す（契約のDot）。nilはDBのNOT NULLより先にここで拒否する。
  validates :sentence, length: { maximum: SENTENCE_MAX_LENGTH }, exclusion: { in: [nil] }
  validates :summary, length: { maximum: SUMMARY_MAX_LENGTH }, exclusion: { in: [nil] }
  # PostgreSQLのtextはNUL文字を保存できず、DBの例外になる。APIを通らない保存（生成のJob）でも
  # validationの失敗として扱えるよう、modelで先に拒否する。壊れたUTF-8はRailsのvalidator自体が例外を
  # 出すため、外部の文字列を受け取る側（TASK-009）で`valid_encoding?`を確かめる。
  validates :sentence, :summary, format: { without: /\u0000/ }

  # `date`はDBが`started_at`から算出する。代入しても保存されず、手元の値だけが食い違うため拒否する。
  # そのため`on_date`を含むscopeから`new`・`first_or_create`などでDotを組み立てない（whereの値が代入される）。
  def date=(_value)
    raise ActiveRecord::ReadonlyAttributeError, "date"
  end

  # 時刻のAsia/Tokyoの暦日。DBの生成列（`date`）と同じ規則で、今日の判定に使う。
  def self.date_for(time) = time.in_time_zone(TIME_ZONE).to_date
end
