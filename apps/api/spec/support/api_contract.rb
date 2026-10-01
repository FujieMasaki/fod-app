# API契約の正本（contracts/openapi.yaml）をspecから参照する。
# request specで`assert_response_schema_confirm(status)`を呼ぶと、実際のresponseを契約と照合する。
module ApiContract
  SCHEMA_PATH = Rails.root.join("../../contracts/openapi.yaml").to_s
  VALIDATOR_OPTIONS = OpenAPIParser::SchemaValidator::Options.new(coerce_value: false)

  ResponseExample = Data.define(:path, :http_method, :status, :content_type, :name, :value) do
    def label = "#{http_method.upcase} #{path} #{status} #{name}"
  end

  class << self
    def schema
      @schema ||= Committee::Drivers.load_from_file(SCHEMA_PATH, parser_options: { strict_reference_validation: true })
    end

    # 契約のresponseに付いたexamplesを列挙する。WebとAPIが同じ意味で解釈することを確かめる共通の具体例。
    def response_examples
      raw.fetch("paths").flat_map do |path, operations|
        operations.flat_map do |http_method, operation|
          next [] unless operation.is_a?(Hash)

          operation.fetch("responses", {}).flat_map do |status, response|
            examples_for(path, http_method, status, resolve(response))
          end
        end
      end
    end

    # 値が契約のresponse schemaに合わなければOpenAPIParserの例外を投げる。
    def validate_response!(value, path:, http_method:, status:, content_type:)
      schema.open_api.paths.path.fetch(path).operation(http_method).responses.response.fetch(status)
            .content.fetch(content_type).validate_parameter(value, VALIDATOR_OPTIONS)
    end

    private

    def raw
      @raw ||= YAML.safe_load_file(SCHEMA_PATH)
    end

    def resolve(node)
      return node unless node.is_a?(Hash) && node.key?("$ref")

      node["$ref"].delete_prefix("#/").split("/").reduce(raw) { |current, key| current.fetch(key) }
    end

    def examples_for(path, http_method, status, response)
      response.fetch("content", {}).flat_map do |content_type, media|
        media.fetch("examples", {}).map do |name, example|
          value = resolve(example).fetch("value")
          ResponseExample.new(path:, http_method:, status:, content_type:, name:, value:)
        end
      end
    end
  end
end

# committee-rails 0.10.0は最初のassertionのrequestを覚えたままにするため、1つのexampleで複数回
# requestすると、後のresponseを最初のendpointの定義で照合してしまう。毎回いまのrequestを包み直す。
module ApiContractRequestObject
  def request_object
    Committee::Rails::RequestObject.new(integration_session.request)
  end
end

RSpec.configure do |config|
  config.add_setting :committee_options
  config.committee_options = {
    schema_path: ApiContract::SCHEMA_PATH,
    strict_reference_validation: true,
    parse_response_by_content_type: true,
    # 契約に無いcontent typeのresponseを、schemaの照合を飛ばして通さない
    strict_response_content_type: true
  }
  config.include Committee::Rails::Test::Methods, type: :request
  config.include ApiContractRequestObject, type: :request
end
