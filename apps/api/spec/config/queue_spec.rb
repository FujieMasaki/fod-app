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

  def worker_threads(max_threads)
    load_yaml("config/queue.yml", max_threads).dig("production", "workers", 0, "threads")
  end

  { "3" => 1, "4" => 2 }.each do |max_threads, expected|
    it "RAILS_MAX_THREADS=#{max_threads}なら、threadsは#{expected}で、2との和がDBの接続数を超えない" do
      connections = load_yaml("config/database.yml", max_threads).dig("production", "max_connections")

      expect(worker_threads(max_threads)).to eq(expected)
      expect(worker_threads(max_threads) + 2).to be <= connections
    end
  end

  ["2", "abc", ""].each do |max_threads|
    it "RAILS_MAX_THREADS=#{max_threads.inspect}なら、ArgumentErrorで起動を止める" do
      expect { worker_threads(max_threads) }.to raise_error(ArgumentError, /RAILS_MAX_THREADS/)
    end
  end

  it "RAILS_MAX_THREADSが未設定なら、threadsは既定の5から導いた3になる" do
    expect(worker_threads(nil)).to eq(3)
  end
end
