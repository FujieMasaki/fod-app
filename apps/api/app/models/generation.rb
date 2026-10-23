# 処理の記録（TASK-003 Plan §20）。録音attempt 1つにつき1行で、主キーが処理ID（＝録音attemptの識別子）。
# 進行中・失敗中・後片付け待ちの間だけ残り、後片付けが終わったら行を消す。成功したかはまず`dots`を見る。
#
# - 状態の変更はすべて`transition`の条件付き更新で行う。読んでから書く形では、再試行と取り消しのように
#   同じ記録を奪い合う更新が両方勝ち得るため（同§20「すべての遷移は条件付き更新で行う」）。
# - 外部の呼び出しは、状態を確保したtransactionのcommitの後に行う（呼び出す側の責務）。
class Generation < ApplicationRecord
  STATES = %w[uploading upload_failed accepted transcribing generating failed
              succeeded_cleanup_pending cancel_requested cleanup_pending].freeze
  # 内部の失敗の種類。送信・文字起こし・外部AI・生成結果の検証・保存を区別する。契約では`contract_failure_kind`へまとめる
  FAILURE_KINDS = %w[upload_incomplete transcription_failed empty_recording generation_failed
                     invalid_output persist_failed].freeze
  # cancel_requestedへ移った契機。照会の応答（期限切れは`expired`、それ以外は404）と後片付けの範囲を決める
  CANCEL_REASONS = %w[canceled expired withdrawn dot_purged].freeze
  # 生成へ進まない状態（以後は後片付けだけ）
  CANCELED_STATES = %w[cancel_requested cleanup_pending].freeze
  # Dotがまだ無く、処理の取り消しを受け付ける状態（architecture「処理の取り消し」）
  CANCELABLE_STATES = %w[uploading upload_failed accepted transcribing generating failed].freeze
  RETRY_WINDOW = 24.hours
  # 録音attemptで送信できる期間（発行から2時間。dot-history.md §2）。発行時刻は`started_at`
  ATTEMPT_LIFETIME = 2.hours

  STATES.each { |state| const_set(state.upcase, state) }

  belongs_to :user

  attr_readonly :user_id, :started_at, :accepted_at, :retry_expires_at, :user_generation

  validates :state, inclusion: { in: STATES }
  validates :failure_kind, inclusion: { in: FAILURE_KINDS }, allow_nil: true
  validates :cancel_reason, inclusion: { in: CANCEL_REASONS }, allow_nil: true
  validates :duration_seconds, numericality: { only_integer: true, in: Dot::DURATION_RANGE }

  # 遷移元が`from`のどれかである場合だけ`to`へ移し、移せたらtrueを返す。`attrs`は同じUPDATEで書く。
  # `holding`を渡すと、その実行権を持っている場合だけ移す（取り消しで実行権を失った実行を止める）。
  # 最終進捗時刻も同時に進める（stale判定の材料。単独の根拠にはしない）。
  # 条件付きのUPDATEそのものが目的なので、validationを通さない`update_all`を使う（値はserverが決めたものだけ）。
  def self.transition(id, from:, to:, holding: nil, **attrs) # rubocop:disable Naming/PredicateMethod
    raise ArgumentError, "unknown state: #{to}" unless STATES.include?(to)

    now = Time.current
    scope = where(id:, state: Array(from))
    scope = scope.where(lease_token: holding) if holding
    changes = attrs.merge(state: to, last_progress_at: now, updated_at: now)
    scope.update_all(changes) == 1 # rubocop:disable Rails/SkipsModelValidations
  end

  # 実行権が空いていれば（無い・期限切れ）、状態を変えずに新しい実行権を取り、そのtokenを返す。取れなければnil。
  # cleanupの再実行（自己遷移T17・T20）と、止まったJobの再実行で使う。
  def self.acquire_lease(id, state:, duration:, now: Time.current)
    token = SecureRandom.uuid
    free = where(lease_expires_at: nil).or(where(lease_expires_at: ..now))
    changes = { lease_token: token, lease_expires_at: now + duration, updated_at: now }
    token if where(id:, state:).merge(free).update_all(changes) == 1 # rubocop:disable Rails/SkipsModelValidations
  end

  # 実行権を手放す（失敗した後片付けを、次の実行が取り直せるようにする）。
  def self.release_lease(id, token)
    where(id:, lease_token: token).update_all(lease_token: nil, lease_expires_at: nil) # rubocop:disable Rails/SkipsModelValidations
  end

  def canceled? = CANCELED_STATES.include?(state)
  def expired?(now = Time.current) = retry_expires_at <= now
  def attempt_expires_at = started_at + ATTEMPT_LIFETIME

  # 契約の`failure.kind`。文字起こし・生成・保存の失敗は`processing_failed`にまとめ、再開点はserverが決める。
  def contract_failure_kind
    case failure_kind
    when "upload_incomplete", "empty_recording" then failure_kind
    else "processing_failed"
    end
  end

  # 文字起こし全文を返してよいか。返さない条件（ACK・期限・完全削除・退会）は受理の時点で効き、
  # 物理削除の完了を待たない（TASK-003 Plan §27「返さない条件」）。
  def transcript_returnable?(now = Time.current)
    transcript_ready_at.present? && transcript_withheld_at.nil? && !expired?(now) && !canceled?
  end
end
