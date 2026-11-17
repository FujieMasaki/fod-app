class CreateConsumedRecordingAttempts < ActiveRecord::Migration[8.1]
  def change
    # 処理の取り消し・Dotの完全削除・退会で処理の記録とDotを消した後に、同じattemptで作り直されるのを防ぐ
    # （privacy.md §5-1「使用済みの録音attempt」）。attemptのidと期限だけを持ち、利用者・本文・音声を持たない。
    # 保持する項目を絞るため、作成・更新の時刻も持たない
    create_table :consumed_recording_attempts, id: :uuid, default: nil do |t| # rubocop:disable Rails/CreateTableWithTimestamps
      t.datetime :expires_at, null: false
    end

    add_index :consumed_recording_attempts, :expires_at
  end
end
