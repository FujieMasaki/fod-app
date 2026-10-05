module Api
  module V1
    # Dotの`sentence`と`summary`の編集（契約のupdateDot）。本人のゴミ箱の外のDotだけを対象にする。
    # 編集前の値は残さない（版も履歴も持たない）。
    class DotsController < ApplicationController
      EDITABLE_FIELDS = { sentence: Dot::SENTENCE_MAX_LENGTH, summary: Dot::SUMMARY_MAX_LENGTH }.freeze

      # 項目を`dot`で包まない。包んだ項目が許可しない項目として数えられるため。
      wrap_parameters false
      before_action :authenticate_user!

      # 入力を先に確かめ、存在しない・他人の・ゴミ箱の中のDotかで応答を変えない（どれも404）。
      def update
        input = permit_optional_strings(EDITABLE_FIELDS)
        return unless input

        dot = current_user.dots.kept.find(params.expect(:dot_id))
        dot.update!(input)
        render json: DotSerializer.new(dot)
      end
    end
  end
end
