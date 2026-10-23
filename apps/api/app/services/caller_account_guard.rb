# 音声・テキストをAWSへ送る前に、呼び出し元がアプリ用のメンバーアカウントであることを確かめる
# （TASK-009の完了条件。管理アカウントや組織の外のアカウントにはopt-outやSCPが効かないため）。
# 比べる値（`FOD_APP_ACCOUNT_ID`）はgitに入れない環境の設定から読み、リポジトリに記録しない。
module CallerAccountGuard
  class Mismatch < StandardError; end

  @verified = false

  class << self
    def verify!(sts: nil)
      return if @verified

      expected = GenerationSettings.app_account_id
      actual = (sts || Aws::STS::Client.new(region: GenerationSettings.region, logger: nil)).get_caller_identity.account
      raise Mismatch, "AWS caller is not the app account; nothing was sent" unless actual == expected

      @verified = true
    end

    def reset = (@verified = false)
  end
end
