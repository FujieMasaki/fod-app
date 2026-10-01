require "rails_helper"

# Web側は apps/web/src/libs/api-contract/schemas.test.ts が同じexamplesをZodで読む。
RSpec.describe ApiContract do
  let(:generation_location) do
    { path: "/api/v1/generations/{generation_id}", http_method: "get", status: "200",
      content_type: "application/json" }
  end
  let(:generation_base) do
    { "id" => "6b1f0c2e-7a4d-4c1b-8e2f-3a9d5c7b1e04", "started_at" => "2026-09-28T13:04:05Z", "retryable" => false }
  end

  described_class.response_examples.each do |example|
    it "accepts #{example.label}" do
      location = example.to_h.slice(:path, :http_method, :status, :content_type)

      expect { described_class.validate_response!(example.value, **location) }.not_to raise_error
    end
  end

  it "rejects an unknown status" do
    generation = generation_base.merge("status" => "unknown", "retry_expires_at" => "2026-09-29T13:20:11Z")

    expect { described_class.validate_response!(generation, **generation_location) }
      .to raise_error(OpenAPIParser::OpenAPIError)
  end

  it "rejects a succeeded generation without its dot" do
    transcript = { "status" => "available", "text" => "" }
    generation = generation_base.merge("status" => "succeeded", "transcript" => transcript)

    expect { described_class.validate_response!(generation, **generation_location) }
      .to raise_error(OpenAPIParser::OpenAPIError)
  end

  it "rejects a processing generation without its retry deadline" do
    generation = generation_base.merge("status" => "processing", "stage" => "transcribing", "poll_after_seconds" => 3)

    expect { described_class.validate_response!(generation, **generation_location) }
      .to raise_error(OpenAPIParser::OpenAPIError)
  end

  it "rejects a rate_limited problem without retry_after_seconds" do
    problem = { "type" => "urn:focus-on-dot:problem:rate_limited", "title" => "x", "status" => 429,
                "code" => "rate_limited" }
    location = { path: "/api/v1/session", http_method: "post", status: "429", content_type: "application/problem+json" }

    expect { described_class.validate_response!(problem, **location) }.to raise_error(OpenAPIParser::OpenAPIError)
  end

  it "rejects a timestamp that does not end with Z" do
    generation = generation_base.merge("status" => "expired", "retry_expires_at" => "2026-09-29T13:20:11+00:00")

    expect { described_class.validate_response!(generation, **generation_location) }
      .to raise_error(OpenAPIParser::OpenAPIError)
  end
end
