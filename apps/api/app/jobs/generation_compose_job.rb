# 生成して保存する（T11・T12）
class GenerationComposeJob < ApplicationJob
  def perform(generation_id) # rubocop:disable Rails/Delegate
    GenerationComposition.perform(generation_id)
  end
end
