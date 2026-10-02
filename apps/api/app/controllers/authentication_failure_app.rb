# Wardenが認証を投げ返したとき（sessionの利用者がロック中になったなど）のrack app。
# Deviseの既定（HTMLへのredirect・flash）ではなく、契約どおりの`401 unauthenticated`を返す。
class AuthenticationFailureApp
  def self.call(_env)
    problem = ProblemDetails.new(:unauthenticated)
    headers = { "content-type" => ProblemDetails::CONTENT_TYPE, "cache-control" => "no-store" }
    [problem.status, headers, [problem.as_json.to_json]]
  end
end
