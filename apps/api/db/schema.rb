# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_10_02_000003) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "rate_limit_counters", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.integer "count", default: 0, null: false
    t.datetime "created_at", null: false
    t.datetime "expires_at", null: false
    t.string "key_digest", null: false
    t.datetime "updated_at", null: false
    t.datetime "window_started_at", null: false
    t.index ["expires_at"], name: "index_rate_limit_counters_on_expires_at"
    t.index ["key_digest", "window_started_at"], name: "index_rate_limit_counters_on_key_digest_and_window_started_at", unique: true
  end

  create_table "user_identities", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "provider", null: false
    t.string "uid", null: false
    t.datetime "updated_at", null: false
    t.uuid "user_id", null: false
    t.index ["provider", "uid"], name: "index_user_identities_on_provider_and_uid", unique: true
    t.index ["user_id", "provider"], name: "index_user_identities_on_user_id_and_provider", unique: true
    t.index ["user_id"], name: "index_user_identities_on_user_id"
  end

  create_table "users", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "confirmation_sent_at"
    t.string "confirmation_token"
    t.datetime "confirmed_at"
    t.datetime "created_at", null: false
    t.string "email", null: false
    t.string "encrypted_password"
    t.integer "failed_attempts", default: 0, null: false
    t.datetime "locked_at"
    t.datetime "reset_password_sent_at"
    t.string "reset_password_token"
    t.string "unlock_token"
    t.datetime "updated_at", null: false
    t.index ["confirmation_token"], name: "index_users_on_confirmation_token", unique: true
    t.index ["email"], name: "index_users_on_email", unique: true
    t.index ["reset_password_token"], name: "index_users_on_reset_password_token", unique: true
    t.index ["unlock_token"], name: "index_users_on_unlock_token", unique: true
  end

  add_foreign_key "user_identities", "users", on_delete: :cascade
end
