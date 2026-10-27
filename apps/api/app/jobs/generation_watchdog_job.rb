# 定期実行（config/recurring.yml）。止まった処理を状態ごとに検知して回収する。
class GenerationWatchdogJob < ApplicationJob
  def perform
    GenerationWatchdog.sweep
  end
end
