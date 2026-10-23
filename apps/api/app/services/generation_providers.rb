# 生成で使う外部（S3・Transcribe・Bedrock）の入口（TASK-009 Plan §7-5）。testでは`use`で偽物へ差し替える。
#
# - 認証はSDKの既定の探索に任せる（開発はIAM Identity Center、本番はECS task role）。長期キーを読まない。
# - SDKのloggerを付けない。requestとresponseに音声・文字起こし・生成の入出力が入るため（architecture「ログへ出さない」）。
# - 最初に外部へ送る前に、呼び出し元がアプリ用アカウントかを確かめる（CallerAccountGuard）。
module GenerationProviders
  # 外部の失敗。messageには例外の種類だけを入れ、外部のmessage（入力を含み得る）を写さない。
  class Error < StandardError
    def self.wrap(error) = new("#{error.class.name} from the provider")
  end

  class << self
    def storage = (@storage ||= AudioStore.new(client: aws_client(Aws::S3::Client), bucket: GenerationSettings.bucket))
    def transcriber = (@transcriber ||= TranscriptionGateway.new(client: aws_client(Aws::TranscribeService::Client)))
    def composer = (@composer ||= DotComposer.new(client: aws_client(Aws::BedrockRuntime::Client)))

    def use(storage: nil, transcriber: nil, composer: nil)
      @storage = storage
      @transcriber = transcriber
      @composer = composer
    end

    def reset = use

    private

    def aws_client(klass)
      CallerAccountGuard.verify!
      klass.new(region: GenerationSettings.region, logger: nil, http_wire_trace: false)
    end
  end
end
