# Transcribeのjobの状態を1回見る（完了待ち。非終端なら自分をもう一度enqueueする）
class GenerationTranscriptionCheckJob < ApplicationJob
  def perform(generation_id)
    GenerationTranscription.check(generation_id)
  end
end
