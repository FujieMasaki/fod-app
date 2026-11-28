# testで使う、S3・Transcribe・Bedrockの偽物（GenerationProviders.useで差し替える）。
# 実際のadapterと同じ入口を持ち、失敗や途中の割り込みを決定的に起こせる。
module FakeGenerationProviders
  # 失敗を仕込める入口の共通部分
  module Failures
    def fail_next(operation, times: 1)
      failures[operation] += times
    end

    # 呼ばれたときに一度だけ実行する処理（途中の割り込みの再現に使う）
    def before_next(operation, &block)
      hooks[operation] = block
    end

    private

    def failures = (@failures ||= Hash.new(0))
    def hooks = (@hooks ||= {})

    def call!(operation)
      hooks.delete(operation)&.call
      return unless failures[operation].positive?

      failures[operation] -= 1
      raise GenerationProviders::Error, "fake #{operation} failure"
    end
  end

  # S3
  class Storage
    include Failures

    attr_reader :objects

    def initialize = (@objects = {})

    def put(key, body, content_type:)
      call!(:put)
      @objects[key] = { body: body.respond_to?(:read) ? body.read : body, content_type: }
    end

    def exists?(key)
      call!(:exists?)
      @objects.key?(key)
    end

    # 本物（AudioStore#read）と同じく、上限を超えていれば読まずにTooLarge
    def read(key, max_bytes:)
      call!(:read)
      body = @objects.dig(key, :body)
      raise GenerationProviders::TooLarge, "object exceeds #{max_bytes} bytes" if body.to_s.bytesize > max_bytes

      body
    end

    def delete_prefix(prefix)
      # 本物（AudioStore#delete_prefix）と同じ形だけを受け付ける
      raise ArgumentError, "unexpected prefix" unless prefix.match?(%r{\A[a-z]+/[0-9a-f-]{36}/\z})

      call!(:delete_prefix)
      @objects.delete_if { |key, _| key.start_with?(prefix) }
    end

    delegate :keys, to: :@objects
  end

  # Transcribe。jobは:in_progress / :completed / :failedのどれか
  class Transcriber
    include Failures

    attr_reader :jobs, :started

    def initialize(storage)
      @storage = storage
      @jobs = {}
      @started = []
    end

    def start(job_name:, media_key:, content_type:, output_key:)
      call!(:start)
      return :exists if @jobs.key?(job_name)

      @started << job_name
      @jobs[job_name] = { status: :in_progress, media_key:, content_type:, output_key: }
      :started
    end

    def status(job_name)
      call!(:status)
      @jobs.dig(job_name, :status) || :missing
    end

    def delete(job_name)
      call!(:delete)
      raise TranscriptionGateway::NotTerminal if @jobs.dig(job_name, :status) == :in_progress

      @jobs.delete(job_name)
    end

    # jobを終えて、結果を自前のbucketへ書き出す（Transcribeの出力と同じ形のJSON）
    def complete(job_name, text)
      job = @jobs.fetch(job_name)
      job[:status] = :completed
      @storage.objects[job[:output_key]] = { body: { results: { transcripts: [{ transcript: text }] } }.to_json }
    end

    def fail(job_name) = @jobs.fetch(job_name)[:status] = :failed
  end

  # Bedrock。既定は検証を通る出力を返す
  class Composer
    include Failures

    attr_accessor :output
    attr_reader :calls

    def initialize
      @output = { "sentence" => "朝に散歩した日。", "summary" => "朝に近所を散歩したことを話した。" }
      @calls = []
    end

    def compose(transcript:, date:, duration_seconds:)
      call!(:compose)
      @calls << { transcript:, date:, duration_seconds: }
      @output
    end
  end
end

RSpec.shared_context "with fake generation providers" do
  let(:storage) { FakeGenerationProviders::Storage.new }
  let(:transcriber) { FakeGenerationProviders::Transcriber.new(storage) }
  let(:composer) { FakeGenerationProviders::Composer.new }

  before { GenerationProviders.use(storage:, transcriber:, composer:) }
  after { GenerationProviders.reset }
end
