# 文字起こしを始める（T6。再試行のT14の後も）
class GenerationTranscribeJob < ApplicationJob
  def perform(generation_id)
    GenerationTranscription.start(generation_id)
  end
end
