# Stream Deck+ AI Agent Monitor

Elgato Stream Deck+ のエンコーダー（ダイヤル）とタッチストリップを使い、Claude・xAI・Codex の API 残量やクレジット残高をリアルタイムで手元に表示するプラグインです。

AI エージェントを自律稼働させる環境において、画面を一切切り替えずに「今どれだけ残っているか」を物理デバイスで把握し、サイレントな稼働停止や予算超過を防ぐことを目的としています。

## 実装状況

| Task | 内容 | 状態 |
|------|------|------|
| 1 | pnpm ワークスペース構成・依存関係セットアップ | ✅ 完了 |
| 2 | 共通 Zod スキーマ定義（`packages/shared`） | ✅ 完了 |
| 3 | ローカルコレクター実装（`packages/collector`） | ✅ 完了 |
| 4 | Stream Deck プラグイン スケルトン（`packages/plugin`） | ✅ 完了 |
| 5 | IPC・フィードバック統合、閾値警告 UI | 🔲 未着手 |

## 解決する課題

AI エージェントを日常的に深く使うユーザーにとって、以下を瞬時に把握することは極めて重要です。

- **Claude**: 現在のレートリミット窓でトークンがあと何 % 残っているか。いつリセットされるか。
- **xAI**: API にチャージしたプリペイド残高があと何ドル残っているか。
- **Codex (ChatGPT Business)**: 5 時間ローリング窓のメッセージクォータがあと何回残っているか。

## UX / UI 設計方針

Stream Deck+ の限られた表示領域で視認性を最大化するため、**1 ダイヤル = 1 コンソール**設計を採用しています。

### 物理インターフェースの割り当て

| 操作 | 動作 |
|------|------|
| ダイヤル押し込み | 監視プロバイダをサイクル切替（Claude → xAI → Codex） |
| ダイヤル回転 | 表示ビューを切替（Minimal ↔ Detail） |
| タッチストリップタップ | 現在プロバイダの表示を即時更新 |

### 表示ビュー

- **Minimal**: 残量 % の数字のみを大きく表示（チラ見用）
- **Detail**: リセット時刻を追加表示

## アーキテクチャ

```
Stream Deck アプリ
  └── packages/plugin      (Elgato SDK, Rollup バンドル)
        │  child_process.fork() + IPC (process.send / process.on('message'))
        └── packages/collector   (Node.js デーモン, axios ポーリング)
              └── packages/shared     (Zod スキーマ / 型定義)
```

### `packages/plugin`

- `@elgato/streamdeck` SDK によるエンコーダー UI 制御
- ダイヤル操作イベント（DialDown / DialRotate / TouchTap）のハンドリング
- 起動時に Collector を `child_process.fork()` でデタッチ起動
- `streamDeck.settings.getGlobalSettings()` で API キーを管理

### `packages/collector`

- Claude / xAI / Codex 各プロバイダへの定期ポーリング（デフォルト 60 秒）
- データを共通スキーマへ正規化し `process.send()` でプラグインへ送信
- 各プロバイダの認証は `SET_CREDENTIALS` IPC メッセージで受け取る

### `packages/shared`

IPC ペイロードの Zod スキーマと TypeScript 型を定義します。

```typescript
// MetricData — プロバイダ共通の正規化メトリクス
{
  provider: "claude" | "xai" | "codex",
  status: "normal" | "warning" | "critical" | "unknown" | "error",
  budget_type: "currency" | "count" | "percent",
  remaining_value: number | null,
  total_budget: number | null,
  remaining_percent: number | null,  // 0–100
  reset_at: string | null,           // ISO 8601
  fetched_at: string                 // ISO 8601
}

// IpcMessage — discriminated union
| { type: "METRICS_UPDATE";   payload: MetricData }
| { type: "SET_CREDENTIALS";  payload: ApiCredentials }
| { type: "COLLECTOR_READY" }
| { type: "COLLECTOR_ERROR";  payload: { message: string } }
```

## Provider 別のデータ取得アプローチ

### Claude (Anthropic)

- **Admin キー** (`sk-ant-admin-...`): `GET /v1/organizations/usage_report/messages` で組織のトークン使用量を取得。
- **標準キー** (`sk-ant-api-...`): `GET /v1/models` へダミーリクエストを送り、レスポンスヘッダ `anthropic-ratelimit-tokens-remaining` / `anthropic-ratelimit-tokens-reset` をパース。

### xAI

- `GET https://api.x.ai/v1/billing/teams/{team_id}/prepaid/balance`
- レスポンスの `total.val` はセント単位の整数文字列（例: `"2000"` = $20.00）。

### Codex (ChatGPT Business)

- `~/.codex/auth.json`（または `$CODEX_HOME/auth.json`）から OAuth Bearer トークンを抽出。
- `GET https://chatgpt.com/backend-api/wham/usage` で 5 時間ローリング窓のクォータ残数とリセット時刻を取得。

## ディレクトリ構成

```
streamdeck-ai-agent-monitor/
├── packages/
│   ├── shared/                  # 共通スキーマ・型 (@ai-monitor/shared)
│   │   └── src/
│   │       ├── schemas.ts       # Zod スキーマ
│   │       ├── types.ts         # infer 型エクスポート
│   │       └── index.ts
│   │
│   ├── collector/               # バックグラウンド収集デーモン
│   │   ├── .env.example
│   │   └── src/
│   │       ├── index.ts         # エントリーポイント（fork 対象）
│   │       ├── ipc.ts           # process.send / on('message') ラッパー
│   │       ├── poller.ts        # プロバイダごとの間欠ポーリング
│   │       ├── utils.ts         # computeStatus / computePercent
│   │       ├── providers/
│   │       │   ├── claude.ts
│   │       │   ├── xai.ts
│   │       │   └── codex.ts
│   │       └── test/            # node:test 単体テスト（15 件）
│   │
│   └── plugin/                  # Stream Deck プラグイン
│       ├── manifest.json        # UUID: com.antigravity.aimonitor
│       ├── rollup.config.mjs
│       ├── layouts/
│       │   └── custom-monitor.json   # 200×100px タッチストリップ定義
│       └── src/
│           ├── plugin.ts             # SDK 初期化・fork・IPC リスナー
│           └── actions/
│               └── monitor.ts        # @action デコレータ・dial イベント処理
│
├── tsconfig.base.json
├── pnpm-workspace.yaml
└── package.json
```

## セットアップ

### 必要環境

- Node.js 20 以上
- pnpm 9 以上
- Elgato Stream Deck+ 本体 + Stream Deck ソフトウェア 6.4 以上

### インストールとビルド

```bash
pnpm install
pnpm build          # shared → collector → plugin の順にビルド
```

### API キーの設定

Stream Deck ソフトウェアのプロパティインスペクターから以下を設定します（Task 5 で実装予定）。現時点での開発・動作確認は `packages/collector/.env.example` を参考に環境変数で代替可能です。

```bash
# packages/collector/.env.example を参照
CLAUDE_API_KEY=sk-ant-api-...   # または sk-ant-admin-...
XAI_API_KEY=xai-...
XAI_TEAM_ID=your-team-id
# Codex は ~/.codex/auth.json を自動参照（設定不要）
POLL_INTERVAL_MS=60000
```

### テスト

```bash
pnpm --filter @ai-monitor/collector test   # 15 件のユニットテスト
```

## タッチストリップのレイアウト

| 領域 | 内容 |
|------|------|
| 左上（小） | プロバイダ名（CLAUDE / XAI / CODEX） |
| 右上（小） | ステータスラベル（LOW / CRITICAL / ERROR） |
| 中央（大） | 残量パーセンテージ（例: `72%`） |
| 下部バー | プログレスバー（0〜100%） |
| 右下（小） | リセット時刻（Detail ビュー時のみ） |

## 初版でやらないこと

- 複数プロバイダの同時横断表示
- 複数ユーザー向けチームダッシュボード
- クラウド同期
