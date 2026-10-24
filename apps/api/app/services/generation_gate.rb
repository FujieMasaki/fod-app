# 入口の手続き（TASK-003 Plan §20）。再試行・再upload・cleanup・取り消し・Transcribeの終端後の確認は、
# 利用者の操作でも自動の回収でも、すべてここを通す。共通なのは手続きで、認可の条件は呼ぶ側がblockで渡す。
#
# 1. 利用者の行を`FOR UPDATE`でlockする（退会の受理も同じ行をlockする）
# 2. 処理の記録の行も`FOR UPDATE`でlockし、現在の状態が遷移元として妥当であることを確かめる（利用者の行をlockしない
#    遷移（失敗の確定など）が、読んでから書くまでの間に状態を変えて、受理が空振りしないようにする。lockの順序は
#    いつも利用者の行 → 記録の行）
# 3. blockで認可の条件を確かめる（理由のSymbolを返したら拒否）
# 4. 実行権を発行し、状態を条件付きで更新してcommitする
# 5. 外部の呼び出しは、呼ぶ側がcommitのあとに行う
module GenerationGate
  LEASE_DURATION = 15.minutes
  # `attrs`で実行権の期限に渡すと、その列を書き換えない（読んだ値を書き戻して、並行して延ばされた期限を消さない）
  KEEP = Object.new.freeze

  Entry = Data.define(:generation, :lease_token)

  # 入口で拒否した。`reason`は :not_found / :state と、blockが返した理由
  class Denied < StandardError
    attr_reader :reason

    def initialize(reason)
      @reason = reason
      super("generation entry denied: #{reason}")
    end
  end

  module_function

  # `attrs`はHashか、記録を受け取ってHashを返すもの。同じUPDATEで書く（実行権の列も上書きできる）。
  def enter(user_id:, generation_id:, from:, to:, attrs: {})
    ActiveRecord::Base.transaction do
      user = User.lock.find_by(id: user_id)
      generation = user && Generation.lock.find_by(id: generation_id, user_id: user.id)
      raise Denied, :not_found unless generation
      raise Denied, :state unless Array(from).include?(generation.state)

      reason = yield(user, generation) if block_given?
      raise Denied, reason if reason

      move(generation, to, attrs)
    end
  end

  # 再試行・再upload・Transcribeの終端後に生成へ進む条件: 利用者がactive・世代が一致・期限内。
  # cleanupには使わない（期限到来・退会の後片付けが抜け出せなくなる。同§20）。
  def proceed_denial(user, generation, now = Time.current)
    return :account_deletion_in_progress if user.deletion_requested?
    return :generation_mismatch if user.generation != generation.user_generation

    :expired if generation.expired?(now)
  end

  def move(generation, to, attrs)
    token = SecureRandom.uuid
    extra = attrs.respond_to?(:call) ? attrs.call(generation) : attrs
    changes = { lease_token: token, lease_expires_at: Time.current + LEASE_DURATION }.merge(extra)
    changes.delete(:lease_expires_at) if changes[:lease_expires_at] == KEEP
    raise Denied, :state unless Generation.transition(generation.id, from: generation.state, to:, **changes)

    Entry.new(generation: generation.reload, lease_token: changes[:lease_token])
  end
  private_class_method :move
end
