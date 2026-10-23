# 生成で使う外部（S3・Transcribe・Bedrock）の入口（TASK-009 Plan §7-5）。testでは`use`で偽物へ差し替える。
#
# - 認証はSDKの既定の探索に任せる（開発はIAM Identity Center、本番はECS task role）。長期キーを読まない。
# - SDKのloggerを付けない。requestとresponseに音声・文字起こし・生成の入出力が入るため（architecture「ログへ出さない」）。
# - 最初に外部へ送る前に、呼び出し元がアプリ用アカウントかを確かめる（下のCallerAccountGuard）。
# - 設定（bucket・model id・アカウントID）が1つでも欠けていれば、どのclientも作らない。model idが未確定の間に
#   音声だけをS3やTranscribeへ送らないため。
module GenerationProviders
  # 外部の呼び出しで起き得る例外（サービスの失敗・通信の失敗・認証情報が無い／期限切れ）
  AWS_ERRORS = [Aws::Errors::ServiceError, Seahorse::Client::NetworkingError, Aws::Errors::MissingCredentialsError,
                Aws::Sigv4::Errors::MissingCredentialsError].freeze
  # Bedrockの呼び出しはSDKに自動で再送させない（同じ生成を二重に消費しないため。失敗は再試行の手順で扱う）。
  # 再送の方式を`standard`に固定し、試行を1回にする（`retry_limit`は`legacy`のときだけ効き、方式と回数は環境変数
  # `AWS_RETRY_MODE`・`AWS_MAX_ATTEMPTS`でも変わるため、両方をここで決める）。
  # 長い出力を待てるよう、読み取りのtimeoutを既定の60秒より長くする。値は実測で見直す
  BEDROCK_CLIENT_OPTIONS = { retry_mode: "standard", max_attempts: 1, http_read_timeout: 120 }.freeze

  # 外部の失敗。messageには例外の種類とAWSのerror code（入力を含まない）だけを入れ、外部のmessage（入力を含み得る）を
  # 写さない。元の例外も`cause`に残さない（error trackingがcauseごと送ると、messageが外へ出るため）。
  class Error < StandardError
    def self.wrap(error)
      code = error.respond_to?(:code) ? " (#{error.code})" : ""
      new("#{error.class.name}#{code} from the provider")
    end

    def self.raise_from(error)
      raise wrap(error), cause: nil
    end
  end

  # 外部へ送る準備ができていない（設定の不足・呼び出し元のアカウントが違う）。何も送っていない
  class NotReady < Error; end

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
        sts ||= Aws::STS::Client.new(region: GenerationSettings.region, logger: nil)
        actual = sts.get_caller_identity.account
        raise Mismatch, "AWS caller is not the app account; nothing was sent" unless actual == expected

        @verified = true
      end

      def reset = (@verified = false)
    end
  end

  class << self
    def storage = (@storage ||= AudioStore.new(client: aws_client(Aws::S3::Client), bucket: GenerationSettings.bucket))
    def transcriber = (@transcriber ||= TranscriptionGateway.new(client: aws_client(Aws::TranscribeService::Client)))

    def composer
      @composer ||= DotComposer.new(client: aws_client(Aws::BedrockRuntime::Client, **BEDROCK_CLIENT_OPTIONS))
    end

    def use(storage: nil, transcriber: nil, composer: nil)
      @storage = storage
      @transcriber = transcriber
      @composer = composer
    end

    def reset = use

    private

    def aws_client(klass, **)
      GenerationSettings.verify_ready!
      CallerAccountGuard.verify!
      klass.new(region: GenerationSettings.region, logger: nil, http_wire_trace: false, **)
    rescue GenerationSettings::NotConfigured, CallerAccountGuard::Mismatch, *AWS_ERRORS => e
      raise NotReady.wrap(e), cause: nil
    end
  end
end
