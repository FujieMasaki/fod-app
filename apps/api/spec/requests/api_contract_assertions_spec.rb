require "rails_helper"

# request specで契約を照合する仕組み（spec/support/api_contract.rb）の回帰テスト。
RSpec.describe "API contract assertions" do
  it "checks the latest request when an example makes several requests" do
    get "/up"
    first_path = request_object.path_info
    get "/api/v1/session"

    expect([first_path, request_object.path_info]).to eq(["/up", "/api/v1/session"])
  end

  describe "a bodyless response" do
    def stub_response(path, method, status)
      request = ActionDispatch::Request.new(Rack::MockRequest.env_for(path, method:))
      allow(self).to receive_messages(request_object: Committee::Rails::RequestObject.new(request),
                                      response_data: [status, {}, ""])
    end

    it "is rejected when the status is not declared for the operation" do
      stub_response("/api/v1/session", "GET", 204)

      expect { assert_response_schema_confirm(204) }.to raise_error(Committee::InvalidResponse)
    end

    it "is accepted when the status is declared for the operation" do
      stub_response("/api/v1/session", "DELETE", 204)

      expect { assert_response_schema_confirm(204) }.not_to raise_error
    end
  end

  describe "a response whose content type is not in the contract" do
    let(:session_request) do
      ActionDispatch::Request.new(Rack::MockRequest.env_for("/api/v1/session", method: "GET"))
    end

    before do
      allow(self).to receive_messages(
        request_object: Committee::Rails::RequestObject.new(session_request),
        response_data: [200, { "Content-Type" => "application/problem+json" }, "{}"]
      )
    end

    it "is rejected" do
      expect { assert_response_schema_confirm(200) }.to raise_error(Committee::InvalidResponse)
    end
  end
end
