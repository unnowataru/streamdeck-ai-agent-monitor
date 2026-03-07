# **Implementation Plan: Stream Deck+ AI Agent Monitor**

## **1\. Project Overview**

本プロジェクトは、Elgato Stream Deck+ のエンコーダー（ダイヤル）およびタッチストリップを利用して、3つのAIプロバイダ（Claude, xAI, Codex）のAPIリソース消費量やクレジット残高を物理デバイス上でリアルタイム監視するシステムである。Stream DeckのUIスレッドをブロックしないよう、UIプラグインプロセスとデータ収集プロセス（ローカルコレクター）を分離したマルチプロセス・アーキテクチャを採用する。

## **2\. Tech Stack & SDK**

* **Package Manager**: pnpm (pnpm workspacesによるモノレポ構成)  
* **Language**: TypeScript (Node.js 20+)  
* **Stream Deck SDK**: @elgato/streamdeck v2 (Node.js native API)  
* **Bundler**: Rollup (@elgato/cli の標準構成に準拠)  
* **Schema Validation & IPC**: zod  
* **Process Management**: child\_process.fork() (Plugin側からCollectorをデタッチ起動)

### **Reference Schemas**

Stream Deckプラグインの静的解析およびUI構築において、エージェントは以下の公式JSONスキーマを参照すること。

* **Manifest Schema**: https://schemas.elgato.com/streamdeck/plugins/manifest.json  
* **Custom Layout Schema**: https://schemas.elgato.com/streamdeck/plugins/layout.json

## **3\. Directory Structure**

streamdeck-ai-agent-monitor/

├── pnpm-workspace.yaml

├── package.json

├── tsconfig.base.json

│

├── packages/

│ ├── shared/ \# 共通のZodスキーマ・型定義

│ │ ├── package.json

│ │ └── src/

│ │ ├── types.ts \# IPCメッセージの型定義 (ActionPayload, QuotaStatus等)

│ │ └── schemas.ts \# Zodスキーマ

│ │

│ ├── collector/ \# バックグラウンドデータ収集デーモン

│ │ ├── package.json

│ │ ├──.env.example \# 各種APIキー・トークン設定用

│ │ └── src/

│ │ ├── index.ts \# エントリーポイント、メインポーリングループ

│ │ ├── ipc.ts \# process.send() / process.on('message') のラッパー

│ │ └── providers/

│ │ ├── claude.ts \# Anthropic Admin API 通信

│ │ ├── xai.ts \# xAI Management API 通信

│ │ └── codex.ts \# \~/.codex/auth.json 解析 & wham/usage 通信

│ │

│ └── plugin/ \# Stream Deck UI制御 (Elgato SDK)

│ ├── package.json

│ ├── rollup.config.mjs

│ ├── manifest.json \# UUID, Actions, Encoderの定義

│ ├── layouts/ \# カスタムタッチストリップUI定義 (.json)

│ └── src/

│ ├── plugin.ts \# Elgato SDK 初期化、Collectorプロセスのfork

│ └── actions/

│ └── monitor.ts \# @action デコレータ、Dialイベントハンドラ、setFeedback更新

## **4\. Hardware UI & Plugin Layer Specs**

### **Manifest Configuration (manifest.json)**

Stream Deck+の機能を有効化するため、Actions配列内の各アクションオブジェクトには以下のプロパティが必須となる。

* "Controllers": \["Encoder"\] を指定。  
* "Encoder" オブジェクト内で、"layout" プロパティにカスタムレイアウトの相対パス（例: layouts/custom-monitor.json）または組み込みレイアウト（$B2, $C1等）を指定。  
* TriggerDescription オブジェクトを定義し、Push、Rotate、Touch に対するUIフィードバック文字列を設定。

### **Custom Layout & Rendering (packages/plugin/layouts/)**

タッチストリップ（200 × 100 px）に独自の情報を描画するためのJSONレイアウトを定義する。

* 利用可能なアイテム: Bar（プログレスバー）、Text（テキスト表示）、Pixmap（画像）。  
* 実行時の更新: プラグインのコードから action.setFeedback({ "key\_name": "New Value" }) を呼び出し、レイアウト内で定義した key に対して非同期で値を流し込む。

## **5\. Collector Layer: API Integration Specs**

ローカルコレクターは、以下のプロバイダ仕様に従ってデータを収集し、正規化したJSONをプラグインへIPC送信（process.send）する。

### **A. Claude (Anthropic)**

**監視対象**: トークン消費量とコスト

* **認証**: ヘッダに x-api-key: sk-ant-admin-... を付与。  
* **エンドポイント**: https://api.anthropic.com/v1/organizations/usage\_report/messages (Admin API)  
* **実装要件**:  
  * 定期的にGETリクエストを送信し、組織内の使用トークン数（Input/Output/Cache）を取得する。  
  * 標準のAPIキー（sk-ant-api...）が設定されている場合は、ダミーリクエストを送信し、レスポンスヘッダに含まれる anthropic-ratelimit-tokens-remaining と anthropic-ratelimit-tokens-reset をパースするフォールバックロジックを実装する。

### **B. xAI**

**監視対象**: APIの前払い（Prepaid）クレジット残高

* **認証**: ヘッダに Authorization: Bearer \<xAI Management API Key\> を付与。  
* **エンドポイント**: https://api.x.ai/v1/billing/teams/{team\_id}/prepaid/balance  
* **実装要件**:  
  * 取得したJSONレスポンスの total.val キーには、USDのセント（Cents）単位の整数文字列（例: "-500"）が格納されている。  
  * これを数値型にキャストし、/ 100 の計算を行ってドル表記の残高にパースする。

### **C. Codex (ChatGPT Business)**

**監視対象**: ChatGPT Businessプランにおけるローカルメッセージおよびクラウドアタスクの5時間ローリングウィンドウ・クォータ残数（300〜1500回等）。

* **認証情報抽出**:  
  * Node.jsの fs.promises を用い、ホストマシンの \~/.codex/auth.json （または $CODEX\_HOME/auth.json）をパースし、有効なOAuth Bearerトークンを抽出する。  
* **エンドポイント**: https://chatgpt.com/backend-api/wham/usage  
* **実装要件**:  
  * 抽出したトークンを用いて上記エンドポイントへ定期的にGETリクエストを発行する。  
  * レスポンスJSONから現在のウィンドウにおける残機（Remaining）と、次回のクォータリセット時刻を抽出し、UI更新用に送信する。

## **6\. Development Task List (For Antigravity Agents)**

エージェントは以下の順序でタスクを実行し、各ステップの完了ごとにローカル環境でのテスト（ビルドおよびプロセスの起動確認）を実施すること。

* \[x\] **Task 1: Workspace Scaffolding**  
  * pnpm-workspace.yaml および package.json のセットアップ。  
  * TypeScript, Rollup, Zod等の依存関係インストール。  
* \[ \] **Task 2: Shared Schema Definition**  
  * packages/shared にて、Zodを用いたIPCペイロード（API認証情報、メトリクスデータ）のスキーマを実装。  
* \[ \] **Task 3: Local Collector Implementation**  
  * packages/collector 内で child\_process 用のエントリーポイントを作成。  
  * axios または fetch を用い、Claude, xAI, CodexのAPIクライアントとポーリングロジックを実装。  
  * モックの環境変数（.env.example）を利用した単体テストコードの作成。  
* \[ \] **Task 4: Stream Deck Plugin Implementation**  
  * packages/plugin/manifest.json とカスタムレイアウトJSONの作成。  
  * @elgato/streamdeck を用いてSDKを初期化し、Dial（Encoder）イベントのハンドリングを実装。  
  * プラグイン起動時にCollectorを child\_process.fork() でデタッチ起動し、IPCリスナーを確立する。  
* \[ \] **Task 5: IPC & Feedback Integration**  
  * Collectorから受信したメトリクスデータを、action.setFeedback() を用いてStream Deckのカスタムレイアウト（テキストおよびプログレスバー）へマッピングする処理を完成させる。