class CreateRateLimitCounters < ActiveRecord::Migration[8.1]
  def change
    # 認証まわりの試行回数を、ECSの複数タスク・再起動をまたいで数える（TASK-006 Plan §12-4）。
    # keyはHMACのdigestで持ち、メールアドレスやIPを生のまま保存しない。
    create_table :rate_limit_counters, id: :uuid do |t|
      t.string :key_digest, null: false
      t.datetime :window_started_at, null: false
      t.datetime :expires_at, null: false
      t.integer :count, null: false, default: 0

      t.timestamps
    end

    add_index :rate_limit_counters, %i[key_digest window_started_at], unique: true
    add_index :rate_limit_counters, :expires_at
  end
end
