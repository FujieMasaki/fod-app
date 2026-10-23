require "rails_helper"

# Solid Queueのworkerは、threadsに2（pollingとheartbeat）を足した数のDB接続を使う。
RSpec.describe "Solid Queueのworkerの設定" do # rubocop:disable RSpec/DescribeClass
  def load_yaml(path, max_threads)
    original = ENV.fetch("RAILS_MAX_THREADS", nil)
    ENV["RAILS_MAX_THREADS"] = max_threads
    YAML.safe_load(ERB.new(Rails.root.join(path).read).result, aliases: true)
  ensure
    ENV["RAILS_MAX_THREADS"] = original
  end

  %w[3 5 8].each do |max_threads|
    it "RAILS_MAX_THREADS=#{max_threads}でも、workerのthreadsと2の和がDBの接続数を超えない" do
      threads = load_yaml("config/queue.yml", max_threads).dig("production", "workers", 0, "threads")
      connections = load_yaml("config/database.yml", max_threads).dig("production", "max_connections")

      expect(threads + 2).to be <= connections
    end
  end
end
