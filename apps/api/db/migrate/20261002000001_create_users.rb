class CreateUsers < ActiveRecord::Migration[8.1]
  def change
    create_table :users, id: :uuid do |t|
      # Deviseが小文字・前後空白なしに正規化して保存する
      t.string :email, null: false
      # Google専用の利用者はpasswordを持たない（null）
      t.string :encrypted_password

      # Confirmable
      t.string :confirmation_token
      t.datetime :confirmed_at
      t.datetime :confirmation_sent_at

      # Recoverable（tokenはdigestで保存される）
      t.string :reset_password_token
      t.datetime :reset_password_sent_at

      # Lockable（tokenはdigestで保存される）
      t.integer :failed_attempts, null: false, default: 0
      t.string :unlock_token
      t.datetime :locked_at

      t.timestamps
    end

    add_index :users, :email, unique: true
    add_index :users, :confirmation_token, unique: true
    add_index :users, :reset_password_token, unique: true
    add_index :users, :unlock_token, unique: true
  end
end
