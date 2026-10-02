# Be sure to restart your server when you modify this file.

# Configure parameters to be partially matched (e.g. passw matches password) and filtered from the log file.
# Use this to limit dissemination of sensitive information.
# See the ActiveSupport::ParameterFilter documentation for supported notations and behaviors.
Rails.application.config.filter_parameters += %i[
  passw email secret token _key crypt salt certificate otp ssn cvv cvc
]
# Google callbackのquery（認可codeとOAuthのstate）。部分一致だとerror_codeなどまで隠すので完全一致にする。
Rails.application.config.filter_parameters += [/\Acode\z/, /\Astate\z/]
