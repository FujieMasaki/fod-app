# Jobの共通の振る舞い。
class ApplicationJob < ActiveJob::Base
  # Jobの失敗は、例外のclass・message・backtraceがログとSolid Queueの`solid_queue_failed_executions.error`に残り、
  # 失敗したJobは消す対象にならない（privacy.md「Jobの記録」）。messageには入力（文字起こし・生成の入出力・DBの値・
  # メールアドレス）が入り得るので、外へ出す前に例外のclassの名前だけにする。messageが入力を含まないと決めた
  # 例外（外部の失敗を包んだもの）だけはmessageを残す。backtraceは調査のために残す。
  # 包み直しは`rescue_with_handler`より内側で起きるので、`retry_on`・`discard_on`・`rescue_from`には`Failed`しか
  # 見えない（元の例外のclassを指定しても一致しない）。足すときは、perform の中で元の例外を扱う。
  class Failed < StandardError; end

  SAFE_MESSAGE_ERRORS = %w[GenerationProviders::Error].freeze

  around_perform do |job, block|
    block.call
  rescue StandardError => e
    raise ApplicationJob.sanitize(e, job:), cause: nil
  end

  def self.sanitize(error, job:)
    safe = SAFE_MESSAGE_ERRORS.any? { |name| error.is_a?(name.constantize) }
    detail = safe ? ": #{error.message}" : ""
    Failed.new("#{error.class.name}#{detail} in #{job.class.name}").tap { it.set_backtrace(error.backtrace) }
  end
end
