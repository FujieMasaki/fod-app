namespace :rate_limits do
  desc "期限の過ぎた試行回数の記録を消す（定期実行の設定は公開基盤の構築時に行う）"
  task purge: :environment do
    deleted = RateLimiter.purge_expired!
    puts "deleted #{deleted} expired rate limit counters"
  end
end
