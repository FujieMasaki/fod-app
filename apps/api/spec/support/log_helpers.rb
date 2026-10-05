# ログに個人データが出ないことを確かめるspecで使う（security.md §6）。blockの間のRailsのログを、debugの
# levelから文字列で返す。
module LogHelpers
  def captured_log
    log = StringIO.new
    logger = ActiveSupport::Logger.new(log, level: :debug)
    Rails.logger.broadcast_to(logger)
    yield
    log.string
  ensure
    Rails.logger.stop_broadcasting_to(logger)
  end
end

RSpec.configure do |config|
  config.include LogHelpers
end
