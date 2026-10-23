# S3へ音声を置いたあとの確定と、置けなかったときの記録（TASK-003 Plan §20「退会と進行中処理の排他」の3）。
# uploadのrequestと、放置された`uploading`を拾うwatchdogの両方が使う。
module GenerationUploadCompletion
  module_function

  # T1: 利用者の行をlockして世代番号を確かめ、`accepted`にしてJobをenqueueする。
  # ずれていれば（退会・取り消しを受理した後に置かれた）、置いた音声を消して取り消しへ回す（T3）。
  # 結果は :accepted / :canceled
  def complete(generation_id, lease_token)
    accepted = ActiveRecord::Base.transaction do
      generation = Generation.find_by(id: generation_id)
      user = generation && User.lock.find(generation.user_id)
      next false unless user && same_generation?(user, generation) && accept(generation_id, lease_token)

      GenerationTranscribeJob.perform_later(generation_id)
      true
    end
    accepted ? :accepted : discard(generation_id, lease_token)
  end

  def same_generation?(user, generation) = !user.deletion_requested? && user.generation == generation.user_generation

  def accept(generation_id, lease_token)
    Generation.transition(generation_id, from: Generation::UPLOADING, to: Generation::ACCEPTED,
                                         holding: lease_token, lease_token: nil, lease_expires_at: nil)
  end

  # T2: 音声が届ききらなかった。同じattemptの期限内なら送り直せる
  def fail(generation_id, lease_token)
    Generation.transition(generation_id, from: Generation::UPLOADING, to: Generation::UPLOAD_FAILED,
                                         holding: lease_token, failure_kind: "upload_incomplete",
                                         lease_token: nil, lease_expires_at: nil)
  end

  # 記録が消えていても手元のprefixで音声を消す（何もしないとobjectだけが残る）。残っていれば取り消しへ回す
  def discard(generation_id, lease_token)
    GenerationProviders.storage.delete_prefix(GenerationNaming.audio_prefix(generation_id))
    generation = Generation.find_by(id: generation_id, state: Generation::UPLOADING, lease_token:)
    GenerationCancellation.request(user_id: generation.user_id, generation_id:, reason: "withdrawn") if generation
    :canceled
  rescue GenerationGate::Denied
    :canceled
  end
  private_class_method :same_generation?, :accept, :discard
end
