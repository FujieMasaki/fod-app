require "rails_helper"

RSpec.describe ApplicationJob do
  let(:job_class) do
    stub_const("FailingJob", Class.new(described_class) do
      def perform(error) = raise(error)
    end)
  end

  it "失敗した例外のmessage（入力を含み得る）を外へ出さず、classの名前とbacktraceだけを残す" do
    error = nil
    begin
      job_class.perform_now(ArgumentError.new("transcript: 今日は歯医者に行った"))
    rescue described_class::Failed => e
      error = e
    end

    expect(error.message).to eq("ArgumentError in FailingJob")
    expect(error.cause).to be_nil
    expect(error.backtrace.join).to include("application_job_spec.rb")
  end

  it "外部の失敗を包んだ例外（messageに入力を含まない）はmessageを残す" do
    message = "Aws::Errors::ServiceError (Throttling) from the provider"

    expect { job_class.perform_now(GenerationProviders::Error.new(message)) }
      .to raise_error(described_class::Failed, "GenerationProviders::Error: #{message} in FailingJob")
  end
end
