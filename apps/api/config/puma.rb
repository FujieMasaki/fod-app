# This configuration file will be evaluated by Puma. The top-level methods that
# are invoked here are part of Puma's configuration DSL. For more information
# about methods provided by the DSL, see https://puma.io/puma/Puma/DSL.html.
#
# Puma starts a configurable number of processes (workers) and each process
# serves each request in a thread from an internal thread pool.
#
# You can control the number of workers using ENV["WEB_CONCURRENCY"]. You
# should only set this value when you want to run 2 or more workers. The
# default is already 1. You can set it to `auto` to automatically start a worker
# for each available processor.
#
# The ideal number of threads per worker depends both on how much time the
# application spends waiting for IO operations and on how much you wish to
# prioritize throughput over latency.
#
# As a rule of thumb, increasing the number of threads will increase how much
# traffic a given process can handle (throughput), but due to CRuby's
# Global VM Lock (GVL) it has diminishing returns and will degrade the
# response time (latency) of the application.
#
# The default is set to 3 threads as it's deemed a decent compromise between
# throughput and latency for the average Rails application.
#
# Any libraries that use a connection pool or another resource pool should
# be configured to provide at least as many connections as the number of
# threads. This includes Active Record's `pool` parameter in `database.yml`.
threads_count = ENV.fetch("RAILS_MAX_THREADS", 3)
threads threads_count, threads_count

# Specifies the `port` that Puma will listen on to receive requests; default is 3000.
port ENV.fetch("PORT", 3000)

# Allow puma to be restarted by `bin/rails restart` command.
plugin :tmp_restart

# requestの本文の大きさの上限（byte）。Pumaは本文を受け取り終えてからアプリへ渡すので、ApiRequestGuardの
# Content-Lengthの確認（33MB）は解析を防ぐだけで、受け取り（diskの一時ファイル・帯域）は防げない。ここで受け取りの
# 途中で止める（長さを偽った本文・長さの無いchunkedの本文も、受け取った量で止まる）。宣言された長さが少しだけ
# 超える本文は契約の形（413 audio_too_large）で返せるよう、guardより1MB大きくする（spec/config/puma_spec.rb）
http_content_length_limit 34 * 1024 * 1024

# Solid QueueのworkerをPumaの子プロセスとして同じコンテナで動かす（TASK-003で採用。ECSの同じタスクで並走させる）。
# 開発でもメールや生成のJobが動くよう、既定で有効にする（Railsの既定はopt-in）。実測で詰まれば
# `SOLID_QUEUE_IN_PUMA=false`にして`bin/jobs`を別に動かす。
plugin :solid_queue unless ENV["SOLID_QUEUE_IN_PUMA"] == "false"

# Specify the PID file. Defaults to tmp/pids/server.pid in development.
# In other environments, only set the PID file if requested.
pidfile ENV["PIDFILE"] if ENV["PIDFILE"]
