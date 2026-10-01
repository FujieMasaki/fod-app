require "rails_helper"

# Web側は apps/web/src/libs/api-contract/schemas.test.ts が同じexamplesをZodで読む。
RSpec.describe ApiContract do
  described_class.response_examples.each do |example|
    it "accepts #{example.label}" do
      location = example.to_h.slice(:path, :http_method, :status, :content_type)

      expect { described_class.validate_response!(example.value, **location) }.not_to raise_error
    end
  end

  describe "a value outside the contract" do
    let(:generation) do
      { "id" => "6b1f0c2e-7a4d-4c1b-8e2f-3a9d5c7b1e04", "status" => "unknown", "started_at" => "2026-09-28T13:04:05Z",
        "retryable" => false, "retry_expires_at" => "2026-09-29T13:20:11Z" }
    end
    let(:location) do
      { path: "/api/v1/generations/{generation_id}", http_method: "get", status: "200",
        content_type: "application/json" }
    end

    it "is rejected" do
      expect { described_class.validate_response!(generation, **location) }.to raise_error(OpenAPIParser::NotEnumInclude)
    end
  end
end
