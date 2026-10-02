class CreateUserIdentities < ActiveRecord::Migration[8.1]
  def change
    create_table :user_identities, id: :uuid do |t|
      t.references :user, null: false, type: :uuid, foreign_key: { on_delete: :cascade }
      t.string :provider, null: false
      # providerが返す不変の利用者ID（Googleのsub）。emailでは対応付けない
      t.string :uid, null: false

      t.timestamps
    end

    # 同じGoogleの利用者を2人のUserへ対応付けない（同時callbackでの重複作成も防ぐ）
    add_index :user_identities, %i[provider uid], unique: true
    add_index :user_identities, %i[user_id provider], unique: true
  end
end
