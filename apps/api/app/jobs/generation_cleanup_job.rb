# 1件の処理の後片付けを行う。再実行が要る結果（失敗・Transcribeの終端待ち）は、GenerationMaintenanceJobが拾い直す。
class GenerationCleanupJob < ApplicationJob
  def perform(generation_id) # rubocop:disable Rails/Delegate
    GenerationCleanup.perform(generation_id)
  end
end
