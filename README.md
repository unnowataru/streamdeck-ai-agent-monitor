# Stream Deck+ AI Agent Monitor

**Claude・xAI・Codex の API 残量を、物理デバイスで手元に表示する Stream Deck+ プラグイン。**
AI エージェントを自律稼働させながら、画面を切り替えることなくクォータ残量をリアルタイム把握できます。

[![CI](https://github.com/unnowataru/streamdeck-ai-agent-monitor/actions/workflows/ci.yml/badge.svg)](https://github.com/unnowataru/streamdeck-ai-agent-monitor/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-9%2B-F69220?logo=pnpm)](https://pnpm.io)

---

## ダウンロード

> **最新リリース**は [Releases ページ](https://github.com/unnowataru/streamdeck-ai-agent-monitor/releases/latest) からダウンロードできます。

| ファイル | 説明 |
|---------|------|
| `com.antigravity.aimonitor.streamDeckPlugin` | Stream Deck+ プラグイン本体（ダブルクリックでインストール） |

CI がビルドした最新成果物（リリース前のスナップショット）は [Actions タブ](https://github.com/unnowataru/streamdeck-ai-agent-monitor/actions/workflows/ci.yml) の各ワークフロー実行 → **Artifacts** からも取得できます。

---

## 解決する課題

AI エージェントを日常的に深く使うユーザーにとって、以下をリアルタイムで把握することは極めて重要です。

| プロバイダ | 監視対象 |
|-----------|---------|
| **Claude** | レートリミット窓のトークン残量 (%) とリセット時刻 |
| **xAI** | プリペイド残高 (ドル) |
| **Codex** | 5 時間ローリング窓のメッセージクォータ残数 |

---

## 実装状況

| # | 内容 | 状態 |
|---|------|------|
| 1 | pnpm ワークスペース構成・依存関係セットアップ | ✅ 完了 |
| 2 | 共通 Zod スキーマ定義（`packages/shared`） | ✅ 完了 |
| 3 | ローカルコレクター実装（`packages/collector`） | ✅ 完了 |
| 4 | Stream Deck プラグイン スケルトン（`packages/plugin`） | ✅ 完了 |
| 5 | IPC・フィードバック統合、ステータスカラー UI | ✅ 完了 |

---

## UX / UI 設計

Stream Deck+ の限られた表示領域で視認性を最大化するため、**1 ダイヤル = 1 コンソール**設計を採用。

### 物理操作

| 操作 | 動作 |
|------|------|
| ダイヤル押し込み | プロバイダをサイクル切替（Claude → xAI → Codex） |
| ダイヤル回転 | 表示ビューを切替（Minimal ↔ Detail） |
| タッチストリップタップ | 現在プロバイダを即時更新 |

### 表示ビュー

| ビュー | 内容 |
|--------|------|
| **Minimal** | 残量 % を大きく表示 ＋ ステータスバッジ（LOW / CRITICAL / ERROR） |
| **Detail** | Minimal ＋ 残量の実値（トークン数 / ドル額）＋ リセット時刻 |

### ステータスとカラー

| 残量 | ステータス | カラー |
|------|-----------|--------|
| 26 % 以上 | `normal` | 緑 `#4caf50` |
| 11〜25 % | `warning` | 橙 `#ff9800` |
| 0〜10 % | `critical` | 赤 `#f44336` |
| 取得失敗 | `error` | 赤 `#f44336` |
| 未取得 | `unknown` | 灰 `#9e9e9e` |

---

## アーキテクチャ

```
Stream Deck アプリ
  └── packages/plugin          (Elgato SDK, Rollup バンドル)
        │  child_process.fork() + IPC (process.send / process.on('message'))
        └── packages/collector  (Node.js デーモン, axios ポーリング)
              └── packages/shared  (Zod スキーマ / 型定義)
```

### packages/plugin

- `@elgato/streamdeck` SDK によるエンコーダー UI 制御
- DialDown / DialRotate / TouchTap イベントのハンドリング
- 起動時に Collector を `child_process.fork()` でデタッチ起動
- `streamDeck.settings.getGlobalSettings()` で API キーを取得し `SET_CREDENTIALS` で Collector へ送信
- `action.setFeedback()` でタッチストリップのテキスト・バーをリアルタイム更新

### packages/collector

- Claude / xAI / Codex 各プロバイダへの定期ポーリング（デフォルト 60 秒）
- データを共通スキーマへ正規化し `process.send()` でプラグインへ送信
- 各プロバイダの認証は `SET_CREDENTIALS` IPC メッセージで受け取る

### packages/shared

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
| { type: "METRICS_UPDATE";  payload: MetricData }
| { type: "SET_CREDENTIALS"; payload: ApiCredentials }
| { type: "COLLECTOR_READY" }
| { type: "COLLECTOR_ERROR"; payload: { message: string } }
```

---

## Provider 別のデータ取得

### Claude (Anthropic)

- **Admin キー** (`sk-ant-admin-...`): `GET /v1/organizations/usage_report/messages` で組織のトークン使用量を取得。
- **標準キー** (`sk-ant-api-...`): `GET /v1/models` へダミーリクエストを送り、レスポンスヘッダ `anthropic-ratelimit-tokens-remaining` / `anthropic-ratelimit-tokens-reset` をパース。

### xAI

- `GET https://api.x.ai/v1/billing/teams/{team_id}/prepaid/balance`
- `total.val` はセント単位の整数文字列（例: `"2000"` = $20.00）

### Codex (ChatGPT Business)

- `~/.codex/auth.json`（または `$CODEX_HOME/auth.json`）から OAuth Bearer トークンを抽出
- `GET https://chatgpt.com/backend-api/wham/usage` で 5 時間ローリング窓のクォータ残数とリセット時刻を取得

---

## ディレクトリ構成

```
streamdeck-ai-agent-monitor/
├── .github/workflows/
│   └── ci.yml                        # Push / PR ごとにビルド・テストを実行
├── packages/
│   ├── shared/                       # 共通スキーマ・型 (@ai-monitor/shared)
│   │   └── src/
│   │       ├── schemas.ts
│   │       ├── types.ts
│   │       ├── index.ts
│   │       └── test/
│   │           └── schemas.test.ts
│   ├── collector/                    # バックグラウンド収集デーモン
│   │   ├── .env.example
│   │   └── src/
│   │       ├── index.ts
│   │       ├── ipc.ts
│   │       ├── poller.ts
│   │       ├── utils.ts
│   │       ├── providers/
│   │       │   ├── claude.ts
│   │       │   ├── xai.ts
│   │       │   └── codex.ts
│   │       └── test/
│   │           ├── utils.test.ts
│   │           ├── claude.test.ts
│   │           ├── xai.test.ts
│   │           └── codex.test.ts
│   └── plugin/                       # Stream Deck プラグイン
│       ├── manifest.json
│       ├── rollup.config.mjs
│       ├── layouts/
│       │   └── custom-monitor.json
│       └── src/
│           ├── plugin.ts
│           └── actions/
│               └── monitor.ts
├── tsconfig.base.json
├── pnpm-workspace.yaml
└── package.json
```

---

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

Stream Deck ソフトウェアのプロパティインスペクターから以下のグローバル設定キーを登録します。
開発・動作確認は `packages/collector/.env.example` を参考に環境変数で代替可能です。

| 設定キー | 説明 |
|----------|------|
| `claudeApiKey` | Anthropic API キー（`sk-ant-api-...` または `sk-ant-admin-...`） |
| `xaiApiKey` | xAI Management API キー |
| `xaiTeamId` | xAI チーム ID |

Codex は `~/.codex/auth.json` を自動参照するため設定不要です。

### テスト

```bash
pnpm --filter @ai-monitor/shared test     # Zod スキーマ検証（20 テスト）
pnpm --filter @ai-monitor/collector test  # プロバイダ + ユーティリティ（30+ テスト）
```

---

## タッチストリップのレイアウト（200 × 100 px）

| 領域 | キー | Minimal | Detail |
|------|------|---------|--------|
| 左上（小） | `provider` | `CLAUDE` / `XAI` / `CODEX` | 同左 |
| 右上（小） | `status` | ステータスバッジ（LOW / CRITICAL 等） | 残量値（`$4.50 left` / `270 / 300 tkn`） |
| 中央（大） | `percent` | `72%`（40px 太字、ステータス色） | `72%`（28px 太字、ステータス色） |
| 下部バー | `bar` | プログレスバー（ステータス色） | 同左 |
| 右下（小） | `reset` | 空白 | `Reset 16:00` |

---

## 初版でやらないこと

- 複数プロバイダの同時横断表示
- 複数ユーザー向けチームダッシュボード
- クラウド同期
