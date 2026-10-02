# 外部の認証providerの利用者（Googleのsub）とUserの対応。providerごとに1つ。
class UserIdentity < ApplicationRecord
  belongs_to :user, inverse_of: :identities

  validates :provider, presence: true
  validates :uid, presence: true
end
