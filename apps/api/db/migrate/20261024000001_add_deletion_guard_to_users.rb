class AddDeletionGuardToUsers < ActiveRecord::Migration[8.1]
  def change
    change_table :users, bulk: true do |t|
      # 退会の受理時刻。NULLがactive（TASK-003 Plan §20「退会と進行中処理の排他」）。受理の操作はTASK-013
      t.datetime :deletion_requested_at
      # 世代番号。退会の受理で1増やし、処理の記録へ写した値と比べて、受理の前に始まった処理の書き込みを止める
      t.integer :generation, null: false, default: 0
    end
  end
end
