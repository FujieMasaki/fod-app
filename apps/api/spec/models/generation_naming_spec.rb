require "rails_helper"

RSpec.describe GenerationNaming do
  let(:id) { SecureRandom.uuid }

  it "処理IDと試行番号から音声・文字起こし結果のkeyとjob名を導く" do
    expect(described_class.audio_key(id, 2)).to eq("audio/#{id}/2")
    expect(described_class.transcript_key(id, 3)).to eq("transcripts/#{id}/3.json")
    expect(described_class.job_name(id, 3)).to eq("#{id}-3")
  end

  it "試行番号を付けた後のjob名全体が、文字種と200文字の制約に収まる（実際の値で確かめる）" do
    names = [1, 2, 99, 10**12].map { described_class.job_name(SecureRandom.uuid, it) }

    expect(names).to all(match(/\A[0-9a-zA-Z._-]+\z/))
    expect(names.map(&:length).max).to be <= 200
  end

  it "試行番号を付けた後に200文字を超えるjob名は作らない" do
    expect { described_class.job_name(id, 10**170) }.to raise_error(GenerationNaming::InvalidName)
  end

  it "UUIDでない処理ID・正でない試行番号を拒否する（推測できる値や区切りを名前に入れない）" do
    expect { described_class.audio_key("user-1", 1) }.to raise_error(GenerationNaming::InvalidName)
    expect { described_class.audio_key("#{id}/../x", 1) }.to raise_error(GenerationNaming::InvalidName)
    expect { described_class.job_name(id, 0) }.to raise_error(GenerationNaming::InvalidName)
  end

  it "異なるattemptは同じ名前を作らない（利用者をまたいで衝突しない）" do
    ids = Array.new(50) { SecureRandom.uuid }
    names = ids.flat_map { [described_class.audio_key(it, 1), described_class.job_name(it, 1)] }

    expect(names.uniq.size).to eq(names.size)
  end
end
