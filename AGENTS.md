# AGENTS.md

## AI Development Workflow

AIは実装の代行者ではなく、設計・実装・レビューを支援するパートナーとして使う。最終的な仕様・
設計・技術判断は、人間が内容を理解した上で決定すること。理解できないコードや設計を、そのまま
完了扱いにしない。

同じディレクトリまたは個人環境で提供される`personal-conventions.md`が存在する場合は、作業前に
必ず読む。Railsを読む・書く場合は、その規約が指す`rails-conventions.md`も読む。

- 実装前に、要件・変更範囲・既存実装への影響・実装方針を整理する。
- 新機能や設計判断を伴う変更では、必要に応じて別のAIにPlanレビューまたはコードレビューを依頼する。
- 実装後は必ずdiffと変更内容を確認し、要件どおりか、不要な変更がないか、人間が説明できるかを確認する。

### 作業前に読む文書

| 作業 | 必読文書 |
| --- | --- |
| すべての実装 | 関連する[`docs/product.md`](docs/product.md) / 機能仕様、[`docs/architecture.md`](docs/architecture.md)、対象変更の既存Implementation Plan |
| frontend実装 | [`docs/development/frontend.md`](docs/development/frontend.md)。UI変更なら加えて[`docs/design-system.md`](docs/design-system.md) |
| backend実装 | [`docs/development/backend.md`](docs/development/backend.md) |
| frontend / backendをまたぐ実装 | frontend・backend両方の実装規約、関連機能仕様、architecture |
| frontendレビュー | [`docs/code-review/frontend/README.md`](docs/code-review/frontend/README.md)、[`security.md`](docs/code-review/frontend/security.md)、関連仕様・frontend実装規約 |
| backendレビュー | [`docs/code-review/backend/README.md`](docs/code-review/backend/README.md)、[`security.md`](docs/code-review/backend/security.md)、関連仕様・backend実装規約 |
| 横断レビュー | 両方のレビュー入口・security観点・実装規約・関連仕様 |

## 文書の役割と更新

- `README.md`: プロジェクト概要、起動方法、文書への入口。
- `docs/product.md`: MVPの目的、範囲、作らないこと、保留事項。
- `docs/<feature>.md`: 独立した振る舞い、データの正本、受け入れ条件、未決定事項。
- `docs/architecture.md`: 構成、責務、継続する設計判断と理由。
- `docs/development/`: 実装時の境界・制約・判断基準。
- `docs/code-review/`: 差分を検証し、根拠と重大度を報告する方法。
- `docs/implementation-plans/`: 変更単位の背景、方針、判断、実装差異、検証結果。

コードまたは仕様を変える変更では、関連する現行文書を同じ変更で更新する。変更のない文書を
形式的に更新しない。画面やComponentごとに仕様文書を機械的に増やさず、独立した振る舞い・判断が
増えたときだけ追加する。

## Implementation Plan

新機能、複数ファイル変更、データフロー / state / API / storageの変更、新しいlibrary、設計判断、
影響範囲の大きい変更では、実装前に
[`docs/implementation-plans/TEMPLATE.md`](docs/implementation-plans/TEMPLATE.md)を基にPlanを作成する。
Planには何をするかだけでなく、なぜその方法を選ぶか、対象外、参照文書、更新する現行文書、検証を
記載する。重大な設計判断または複数の有力案がある場合だけ、Plan後に人間の判断を求める。

過去のPlanのCurrent Stateは当時の記録である。現在の状態へ書き換えず、現行仕様・architectureで
別に管理する。
## Pull Requests

- ユーザーからPR作成を依頼されたら、作成前に「この内容でPRを作成してもいいですか？」と再確認して止まらず、必要なpushとPR作成まで進める。確認を依頼する場合は、作成後にPRのURLを示して行う。
- PRのタイトルと本文は日本語で書く。コード上の識別子や技術用語は必要に応じてそのまま使う。
- PR本文は `.github/pull_request_template.md` に従い、「概要」「取り組んだ理由」「取り組んだこと」「確認すること」をこの順で記載する。バグ対応では「取り組んだ理由」と「取り組んだこと」の間に「原因」を追加し、確認できた原因を具体的に説明する。原因が未確定なら、その旨と確認済みの事実を明記する。
- 「確認すること」には、人間による確認が必要な操作・画面・仕様上の判断を、期待結果がわかるTODOリストで記載する。自動テストの実施記録や実装作業の完了報告で代用しない。
- テンプレートの説明コメントやプレースホルダーを完成したPR本文に残さない。

## Code Review

レビューは該当するレビュー入口を起点に、差分と判断に必要な関連実装・test・設定を確認する。
securityは必ず確認し、仕様・受け入れ条件、責務と依存、認証・認可、秘密情報・個人データ、録音・
生成結果の保存/送信/削除、状態不整合・異常系・再試行、API契約・互換性、test不足を確認する。

- 指摘には重大度（🔴 / 🟠 / 🟡 / 🔵）、ファイル・行、根拠、影響、修正案、確信度を付ける。
- 事実と推測、修正が必要な問題と任意の改善を区別する。根拠が不足するものは要確認として前提を示す。
- security上の問題または疑いがある場合は、対応前に`LGTM`と判断しない。
- ローカルレビューの結果はチャットに出力し、明示的な依頼なしに外部サービスへ投稿・承認しない。
- 見落としや継続的な誤検知を発見した場合は、該当するレビュー指針を改善する。

## Change Explanation

ユーザーから今回の実装の説明を求められた場合は、次の6項目で回答する。

1. 何を変更したか: ユーザーから見た変更、主なコード変更、主要ファイル。
2. なぜこの設計にしたか: 要件との関係、採用理由、必要なら代替案を採用しなかった理由。
3. データがどう流れるか: `User Action → Component → Hook / State → API / Storage → State Update → UI Update`。データフローがない変更では、その旨を明記する。
4. 重要なライブラリ / API: 関係するものだけについて、用途、使用箇所、必要な理由。
5. 将来変更するときに注意する箇所: 依存、state、API、データ構造、Browser API、エラー処理、性能、後方互換性のうち壊れやすい点。
6. 私が理解しておくべきコード3箇所: 最大3箇所について、path、関数 / Component / Hook、役割、読む理由、可能なら行番号を示す。

## UI / Design

UIを実装・変更する前に、必ず[`docs/design-system.md`](docs/design-system.md)を読む。同文書の
Tailwind CSS v4、既存Design Token、shadcn/ui、静けさ・可読性、画面別UI原則に従う。スタイルの
規約本文をこのファイルや実装規約に複製しない。

## 完了前

- 実装前に要件、変更範囲、既存実装への影響、方針を整理したか。
- 必要なtestと手動確認を実行し、結果をPlanへ記録したか。
- diffを確認し、要件どおりで不要な変更・秘密情報がなく、人間が説明できるか確認したか。