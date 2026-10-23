namespace :generation do
  # 最初に音声・テキストをAWSへ送る前に、人間が呼び出し元のアカウントを確かめるために使う（TASK-009の完了条件）。
  # 表示した値がアプリ用なら、gitに入れない環境の設定の`FOD_APP_ACCOUNT_ID`へ置く。値はリポジトリに記録しない。
  desc "AWSの呼び出し元のアカウントを表示する（音声やテキストは送らない）"
  task caller_identity: :environment do
    identity = Aws::STS::Client.new(region: GenerationSettings.region, logger: nil).get_caller_identity
    puts "account: #{identity.account}"
    puts "arn: #{identity.arn}"
  end
end
