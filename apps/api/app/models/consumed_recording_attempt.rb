# 使用済みの録音attempt（privacy.md §5-1）。処理の取り消し・Dotの完全削除・退会で処理の記録とDotを消した後に、
# 同じattemptで消したものが作り直されないよう、attemptのidと期限だけを期限まで残す。利用者のidは持たない。
class ConsumedRecordingAttempt < ApplicationRecord
  scope :live, ->(now = Time.current) { where("expires_at > ?", now) }
  scope :expired, ->(now = Time.current) { where(expires_at: ..now) }

  # attemptの期限が残っている場合だけ残す。既にあれば何もしない（取り消しの再送・完全削除と退会の重なり）。
  def self.record(id, expires_at:, now: Time.current)
    return if expires_at <= now

    insert_all([{ id:, expires_at: }], unique_by: :id) # rubocop:disable Rails/SkipsModelValidations
  end

  def self.consumed?(id, now = Time.current) = live(now).exists?(id:)
end
