class CreateGenerations < ActiveRecord::Migration[8.1]
  STATES = %w[uploading upload_failed accepted transcribing generating failed
              succeeded_cleanup_pending cancel_requested cleanup_pending].freeze
  FAILURE_KINDS = %w[upload_incomplete transcription_failed empty_recording generation_failed
                     invalid_output persist_failed].freeze
  CANCEL_REASONS = %w[canceled expired withdrawn dot_purged].freeze

  def change
    # 処理の記録（TASK-003 Plan §20「処理の記録に持つ項目」）。進行中・失敗中・後片付け待ちの間だけ残し、
    # 音声・文字起こし結果・Transcribeのjobの後片付けが終わったら行を消す。
    # 主キーは録音attemptの識別子（＝処理ID＝冪等性key）。serverが発行するので、AWSの名前もここから導く。
    create_table :generations, id: :uuid, default: nil do |t|
      # cleanupの情報を持つ行を、利用者の行の削除で黙って消さない（退会は進行中の処理が0になってから）
      t.references :user, null: false, type: :uuid, foreign_key: { on_delete: :restrict }
      t.datetime :started_at, null: false
      t.integer :duration_seconds, null: false
      t.string :audio_content_type, null: false
      t.datetime :accepted_at, null: false
      t.datetime :retry_expires_at, null: false
      t.string :state, null: false
      # 受理したときの利用者の世代番号
      t.integer :user_generation, null: false
      t.integer :upload_attempt, null: false, default: 1
      t.integer :transcription_attempt, null: false, default: 0
      t.string :audio_key, null: false
      t.string :transcript_key
      t.string :transcription_job_name
      # 文字起こし結果が自前のS3に書き出された時刻。再試行で生成から始めるかを決める
      t.datetime :transcript_ready_at
      # 文字起こし全文をもう返さないと決めた時刻（ACK・期限・完全削除・退会）。物理削除の完了を待たない
      t.datetime :transcript_withheld_at
      # 実行権。同じ処理を二重に動かさない
      t.uuid :lease_token
      t.datetime :lease_expires_at
      t.datetime :last_progress_at, null: false
      t.string :failure_kind
      t.string :cancel_reason

      t.timestamps
    end

    # watchdogが状態ごとに止まった記録を探す
    add_index :generations, %i[state last_progress_at]
    add_index :generations, :retry_expires_at

    add_check_constraint :generations, "state IN (#{quoted(STATES)})", name: "generations_state"
    add_check_constraint :generations, "failure_kind IS NULL OR failure_kind IN (#{quoted(FAILURE_KINDS)})",
                         name: "generations_failure_kind"
    add_check_constraint :generations, "cancel_reason IS NULL OR cancel_reason IN (#{quoted(CANCEL_REASONS)})",
                         name: "generations_cancel_reason"
    add_check_constraint :generations, "duration_seconds BETWEEN 1 AND 1800", name: "generations_duration_seconds_range"
  end

  private

  def quoted(values) = values.map { "'#{it}'" }.join(", ")
end
