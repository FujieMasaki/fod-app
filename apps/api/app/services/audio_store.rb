# 音声と文字起こし結果を置くS3 bucket（非公開・暗号化・versioning無効。bucketの設定は構築時に確かめる）。
# keyは`GenerationNaming`が処理IDと試行番号から導いたものだけを扱う。
class AudioStore
  def initialize(client:, bucket:)
    @client = client
    @bucket = bucket
  end

  def put(key, body, content_type:)
    @client.put_object(bucket: @bucket, key:, body:, content_type:)
  rescue Aws::Errors::ServiceError, Seahorse::Client::NetworkingError => e
    GenerationProviders::Error.raise_from(e)
  end

  def exists?(key)
    @client.head_object(bucket: @bucket, key:)
    true
  rescue Aws::S3::Errors::NotFound
    false
  rescue Aws::Errors::ServiceError, Seahorse::Client::NetworkingError => e
    GenerationProviders::Error.raise_from(e)
  end

  # 無ければnil
  def read(key)
    @client.get_object(bucket: @bucket, key:).body.read
  rescue Aws::S3::Errors::NoSuchKey
    nil
  rescue Aws::Errors::ServiceError, Seahorse::Client::NetworkingError => e
    GenerationProviders::Error.raise_from(e)
  end

  # prefixの下をすべて消す。現在有効なkeyだけでなく、古い試行のPUTが後から完成したobjectも拾う
  # （TASK-003 Plan §20「孤児の回収」）。既に無ければ何もしない（冪等）。
  def delete_prefix(prefix)
    # 誤ってbucket全体や別の処理のprefixを消さないよう、`<種類>/<処理ID>/`の形だけを受け付ける
    raise ArgumentError, "unexpected prefix" unless prefix.match?(%r{\A[a-z]+/[0-9a-f-]{36}/\z})

    keys_under(prefix).each_slice(1000) do |keys|
      response = @client.delete_objects(bucket: @bucket, delete: { objects: keys.map { { key: it } }, quiet: true })
      raise GenerationProviders::Error, "S3 refused to delete #{response.errors.size} objects" if response.errors.any?
    end
  rescue Aws::Errors::ServiceError, Seahorse::Client::NetworkingError => e
    GenerationProviders::Error.raise_from(e)
  end

  def keys_under(prefix)
    @client.list_objects_v2(bucket: @bucket, prefix:).each_page.flat_map { |page| page.contents.map(&:key) }
  end
end
