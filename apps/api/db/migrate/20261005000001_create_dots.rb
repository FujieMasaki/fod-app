class CreateDots < ActiveRecord::Migration[8.1]
  def change
    # 録音1回から生まれる記録1件（TASK-008 Plan §7-1）。音声も文字起こし全文も持たない。
    create_table :dots, id: :uuid do |t|
      t.references :user, null: false, type: :uuid, index: false, foreign_key: { on_delete: :cascade }
      # 処理ID（＝冪等性key＝録音attemptの識別子）。同じ処理から2件目のDotを作らない
      t.uuid :generation_id, null: false
      # 録音開始操作をserverが受理した時刻（UTC）。dateの根拠で、編集させない
      t.datetime :started_at, null: false
      # started_atのAsia/Tokyoの暦日。DBが算出するので、started_atと食い違う値を書けない
      t.virtual :date, type: :date, stored: true,
                       as: "((started_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tokyo')::date"
      t.integer :duration_seconds, null: false
      t.text :sentence, null: false, default: ""
      t.text :summary, null: false, default: ""
      # NULLがゴミ箱の外。除外はscopeで明示し、default_scopeに頼らない
      t.datetime :trashed_at

      t.timestamps
    end

    add_index :dots, %i[user_id generation_id], unique: true
    # 一覧の日単位の集約・Dayの今日・日の詳細の並びを、ゴミ箱の外だけで引く
    add_index :dots, %i[user_id date started_at id], where: "trashed_at IS NULL", name: "index_dots_kept_by_day"

    add_check_constraint :dots, "duration_seconds BETWEEN 1 AND 1800", name: "dots_duration_seconds_range"
    add_check_constraint :dots, "char_length(sentence) <= 200", name: "dots_sentence_length"
    add_check_constraint :dots, "char_length(summary) <= 2000", name: "dots_summary_length"
  end
end
