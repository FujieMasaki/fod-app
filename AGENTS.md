# AGENTS.md

## UI / Design

UIを実装・変更する前に、必ず `docs/design-system.md` を読み、その基準に従うこと。

- Tailwind CSS v4を標準とし、CSS Modulesは原則として新規採用しない。既存実装の移行方針は同文書に従う。
- CSS Variablesによる既存Design Tokenを優先し、任意の色・余白・装飾を増やさない。
- shadcn/uiは必要なPrimitiveのみ利用し、デフォルトデザインをそのまま使わない。
- 不要なCard、shadow、gradient、border、icon、大きなroundedを追加しない。
- 情報階層は余白とタイポグラフィで表現し、一般的なAI SaaS風UIを避け、静けさと可読性を優先する。
- HomeとDot一覧は同文書の画面別仕様に従う。
