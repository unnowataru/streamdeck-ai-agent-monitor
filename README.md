# Stream Deck+ AI Agent Rate Monitor

このリポジトリは、Elgato Stream Deck+ 上に Claude、xAI、Codex の残量やレートリミット到達までの近さを表示するための公開プロジェクト初期提案です。

現時点では意図的にスコープを絞っています。2026年3月7日時点では設計メモと構想整理のみを含み、まだプラグイン本体の実装コードは入っていません。

## Elgato Stream Deck+ とは何か

Elgato Stream Deck+ は、次の要素を持つデスクトップ向けコントロールデバイスです。

- カスタマイズ可能な LCD キー 8 個
- 押し込み対応の回転ダイヤル 4 個
- キーとダイヤルの間にあるタッチストリップ

単なるショートカットパッドと違い、Stream Deck+ は操作を実行するだけでなく、キー上に状態を常時表示できます。そのため、AI 利用残量のような「常時見えていてほしい情報」を載せる用途と相性が良いです。各キーを小さなステータスタイルとして使い、ダイヤルやタッチストリップでプロバイダ切り替え、表示ページ切り替え、警告閾値調整などを行う構成が考えられます。

公式リファレンス:

- Product page: <https://www.elgato.com/us/en/p/stream-deck-plus>
- SDK overview: <https://docs.elgato.com/streamdeck/sdk/overview/>

## 解決したい課題

AI を日常的に使うユーザーは、気づいたら provider limit に到達していた、という状況が起きやすいです。必要なのは単に「どれだけ使ったか」ではなく、次のような判断材料です。

- 次のレートリミット壁までどれくらい余裕があるか
- いつリセットされるか
- 次の重い作業を投げるならどの provider がまだ安全か
- それを 3 つのダッシュボードを開かずに確認できるか

このプロジェクトは、その判断を 1 つの Stream Deck+ 上でできるようにすることを目標にします。

## 目標

Claude、xAI、Codex の使用余力を Stream Deck+ 上でほぼリアルタイムに表示するプラグインを作ることです。

想定している成果:

- 一目で分かる残量表示
- リセットまでのカウントダウン表示
- 閾値ベースの警告状態表示
- 1 デバイス上での provider 横断比較

## 現在のスコープ

このリポジトリが現時点で扱う範囲:

- 機能提案
- UX 提案
- アーキテクチャ提案
- 実装計画
- 調査メモ

まだ含めないもの:

- Stream Deck プラグイン実装
- provider 連携コード
- 認証情報処理
- Stream Deck Marketplace 向けパッケージング

## 想定ユーザー体験

### デバイス上の見え方

各 provider に対して 1 つのキーを割り当て、次のような情報を表示します。

- provider 名
- 残量パーセンテージ、または推定残リクエスト数 / 残トークン量
- リセットまでの時間
- 状態色

状態色の案:

- 緑: まだ十分余裕がある
- 黄: 制限に近づいている
- 赤: 枯渇が近い
- 灰: データ取得不可

### Stream Deck+ 固有の操作案

- LCD キー: provider ごとの概要表示
- タッチストリップ: `overview`、`detail`、`history-lite` のページ切り替え
- ダイヤル: provider 切り替え、警告閾値調整、時間窓切り替え
- ダイヤル押下: 警告ミュート、または強制更新

## 想定アーキテクチャ

最も安全なのは、次の 2 層構成です。

1. Stream Deck+ プラグイン UI
2. ローカル sidecar collector サービス

### なぜ分けるのか

プラグイン側は描画と操作に集中させるべきです。認証情報、API ポーリング、リトライ、正規化、キャッシュ管理は、ローカルで動く sidecar プロセスに寄せた方が責務分離が明確になります。

### 大まかな構成要素

- `stream-deck-plugin`
  - キー画像とステータステキストを描画する
  - デバイス操作を受け取る
  - 正規化済み provider 状態を購読する
- `local-collector`
  - provider API をポーリングする
  - レートリミットヘッダや usage メタデータを読む
  - 共通スキーマへ正規化する
  - 高速 UI 更新のための短期キャッシュを持つ
- `provider-adapters`
  - `anthropic-adapter`
  - `xai-adapter`
  - `codex-openai-adapter`

### 想定する共通スキーマ

```json
{
  "provider": "xai",
  "status": "ok",
  "remaining_percent": 62,
  "remaining_requests": 124,
  "reset_at": "2026-03-07T15:30:00Z",
  "window_label": "requests/minute",
  "source": "api_headers",
  "fetched_at": "2026-03-07T15:10:05Z"
}
```

## Provider 別の方針

### Claude

基本方針:

- 利用可能なら Anthropic API のレートリミット情報を正本として使う
- request/token ごとの時間窓を、デバイス向けに分かりやすい単一サマリへ正規化する

公式リファレンス:

- <https://docs.anthropic.com/en/api/rate-limits>

### xAI

基本方針:

- xAI API を積極的に利用する
- xAI を後付け provider ではなく、最初から主要 provider の 1 つとして扱う

公式リファレンス:

- <https://docs.x.ai/docs/guides/rate-limits>

### Codex

基本方針:

- ユーザーの Codex 利用が OpenAI API 経由の usage と結びついている場合は、そのレートリミット情報を使う

未確定な点:

- ユーザーが見たい「Codex の残量」が、安定した公開 API から取れない product 固有制限を指す場合、初版では次のいずれかが必要になる可能性があります。
  - API ベースの近似
  - ローカル usage log からの推定
  - ユーザー定義の soft budget

公式リファレンス:

- <https://platform.openai.com/docs/guides/rate-limits>

## 設計原則

- 次のタスクをどの provider に投げるべきかを一目で判断できること
- どれか 1 つの provider が一時的に落ちても graceful に劣化すること
- 認証情報は可能な限りデバイス UI 層から分離すること
- provider ごとの複雑さは共通スキーマの裏側へ隠すこと
- Stream Deck+ の閲覧距離でも読みやすい情報密度に抑えること

## 類似プロジェクトと調査メモ

この README は、2026年3月7日時点の公式ドキュメント、GitHub 調査、公開 web/X 上の情報収集をもとに整理しています。

### 公開調査から見えたこと

- Claude や Codex の usage 可視化ツールには明確な需要があります。
- GitHub 上には usage tracker や menubar dashboard が複数あります。
- 公開 web/X 調査の範囲では、複数 AI provider のレートリミットを Stream Deck+ に常時表示する定番プラグインは見つかっていません。

### 参考にした事例

- `steipete/CodexBar`
  - 複数 provider の残量や reset 時刻を常時見える形で出す発想が参考になる
- `xiangz19/codex-ratelimit`
  - 非侵襲に Codex usage を把握し、警告閾値を扱う考え方が参考になる
- `Maciek-roboblog/Claude-Code-Usage-Monitor`
  - burn rate と「あとどれくらい持つか」の見せ方が参考になる
- `ujjwalm29/tokenator`
  - xAI を含む複数 provider を共通会計モデルで扱う考え方が参考になる
- `elgatosf/streamdeck-plugin-samples`
  - 公式の Stream Deck プラグイン構成とデバイス interaction pattern が参考になる

### 取り入れたい点

- 小さくても一目で分かる表示
- provider 横断の常時比較
- 可能な限り非侵襲なデータ取得
- 枯渇前の予測警告
- hard failure 前の閾値警告
- バックグラウンド更新の摩擦を下げること

### そのまま持ち込まない点

- デスクトップ専用前提の UI
- 非公開・非安定な内部 session format への強い依存
- provider 固有すぎて共通化できない UI
- 特定 vendor の用語に引きずられた設計

## 実装計画

### Phase 0

- README を固める
- provider ごとの実データ取得元の実現性を確認する
- Codex 固有の残量が直接取れるか、推定が必要かを確定する

### Phase 1

- プラグイン skeleton を作る
- local collector skeleton を作る
- 共通ステータススキーマを定義する
- ダミーデータで静的モック表示を作る

### Phase 2

- xAI adapter を最初に実装する
- Claude adapter を次に実装する
- Codex/OpenAI adapter をその次に実装する
- 更新スケジューラとローカルキャッシュを追加する

### Phase 3

- デバイス警告を追加する
- 閾値設定を追加する
- 簡易履歴と最終更新失敗状態を追加する

## 初版でやらないこと

- 請求分析
- 長期トークン会計
- 複数ユーザー向けチームダッシュボード
- クラウド同期
- 初日からの Marketplace 公開

## 次のステップ

1. provider ごとの正本 endpoint / header を確定する。
2. plugin runtime と local sidecar の技術スタックを決める。
3. ダミーデータを使った Stream Deck+ の静的プロトタイプを作る。
4. xAI、Claude、Codex/OpenAI の順で adapter を実装する。

