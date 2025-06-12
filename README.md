# kintone MCP Server for Deno サンプル

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/r3-yamauchi/kintone-deno-mcp-server)

Claude Desktop と [kintone](https://kintone.cybozu.co.jp/) を 連携する Deno による MCP Server のサンプル実装です。
kintoneのデータをAIで操作・分析できます。

**リポジトリ**: [https://github.com/r3-yamauchi/kintone-deno-mcp-server](https://github.com/r3-yamauchi/kintone-deno-mcp-server)

## 🌟 特徴

- 🔒 **セキュアな設計**: Denoの権限システムにより、指定したkintoneドメインのみとの通信を許可
- 🚀 **豊富なツール**: レコード操作、コメント、ステータス、ファイル操作など19個のツールを実装
- 📦 **シンプルな構成**: 単一ファイル（server.js）に全機能を集約
- 🎯 **型安全**: TypeScriptの型チェックに対応

## 📋 必要要件

- **Deno** v2.0以降（推奨: v2.3以降）
- **Claude Desktop** アプリケーション（最新版）
- **kintoneアカウント**（アプリへのアクセス権限が必要）

## 🚀 クイックスタート

### 1. インストール

```bash
# リポジトリのクローン
git clone https://github.com/r3-yamauchi/kintone-deno-mcp-server.git
cd kintone-deno-mcp-server

# Denoのインストール（未インストールの場合）
curl -fsSL https://deno.land/install.sh | sh
```

### 2. 動作確認

デモ環境で動作を確認：

```bash
# 環境変数を設定してサーバー起動
export KINTONE_DOMAIN=dev-demo.cybozu.com
export KINTONE_USERNAME=demo-guest
export KINTONE_PASSWORD=demo-guest
deno task start
```

### 3. Claude Desktop設定

#### 設定ファイルの場所

| OS | パス |
|---|---|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

#### 設定例

```json
{
  "mcpServers": {
    "kintone": {
      "command": "deno",
      "env": {
        "KINTONE_DOMAIN": "your-subdomain.cybozu.com",
        "KINTONE_USERNAME": "your-username",
        "KINTONE_PASSWORD": "your-password"
      },
      "args": [
        "run",
        "--allow-env",
        "--allow-net=your-subdomain.cybozu.com",
        "/absolute/path/to/server.js"
      ]
    }
  }
}
```

#### 設定のポイント

- `KINTONE_DOMAIN`: `https://`は不要、サブドメインのみ指定
- `--allow-net`: セキュリティのため、必ず特定ドメインのみ許可
- パス: server.jsの絶対パスを指定（相対パスは使用不可）

### 4. 再起動

Claude Desktopを完全に終了して再起動（システムトレイからも終了）

## 📚 使用方法

### 基本的な使い方

Claude Desktopで以下のような自然な日本語で操作できます：

```
「顧客管理」アプリの全レコードを取得して

アプリID 10 で会社名に「サイボウズ」を含むレコードを検索して

「営業日報」アプリに新しいレコードを作成して
件名: 本日の活動報告
内容: 新規顧客3社訪問

レコードID 100 のステータスを「承認済み」に更新して
```

### 高度な使い方

```
# 複数レコードの一括作成
10件のテストデータを「商品マスタ」アプリに登録して

# 条件検索とフィールド指定
「受注管理」アプリで今月作成されたレコードの
「顧客名」「金額」「ステータス」フィールドだけ取得して

# コメント操作
レコードID 50 に「確認しました」とコメントを追加して
```

## 🛠️ 利用可能なツール（19個）

### レコード操作（7個）
| ツール名 | 説明 | 主な用途 |
|---------|------|----------|
| `get_record` | 単一レコード取得 | 特定レコードの詳細確認 |
| `search_records` | レコード検索 | 条件に合うレコードの検索 |
| `get_all_records` | 全レコード自動取得 | データ分析・一括処理 |
| `create_record` | レコード作成 | 新規データ登録 |
| `add_records` | 複数レコード一括作成 | 大量データのインポート |
| `update_record` | レコード更新 | 既存データの修正 |
| `update_records` | 複数レコード一括更新 | 大量データの一括修正 |

### コメント・ステータス（4個）
| ツール名 | 説明 | 主な用途 |
|---------|------|----------|
| `get_comments` | コメント一覧取得 | コミュニケーション履歴確認 |
| `add_comment` | コメント追加 | フィードバック・メモ追加 |
| `update_status` | ステータス更新 | ワークフロー進行 |
| `update_statuses` | 複数ステータス一括更新 | 大量承認処理 |

### アプリ・フィールド情報（4個）
| ツール名 | 説明 | 主な用途 |
|---------|------|----------|
| `get_app` | アプリ詳細情報取得 | アプリ設定確認 |
| `get_apps` | アプリ一覧取得 | 利用可能アプリの確認 |
| `get_apps_info` | アプリ名検索 | アプリIDの特定 |
| `get_form_fields` | フィールド定義取得 | スキーマ情報の確認 |

### ファイル操作（2個）
| ツール名 | 説明 | 主な用途 |
|---------|------|----------|
| `upload_file` | ファイルアップロード | 添付ファイルの登録 |
| `download_file` | ファイルダウンロード | 添付ファイルの取得 |

## 🔧 トラブルシューティング

### よくある問題と解決方法

#### 1. MCPサーバーが認識されない

```bash
# 確認項目
1. Claude Desktopを完全に終了（タスクトレイも確認）
2. 設定ファイルのJSONが正しいか確認
3. server.jsのパスが絶対パスか確認
4. Denoがインストールされているか確認
deno --version
```

#### 2. 認証エラー（401 Unauthorized）

```bash
# 確認項目
1. ユーザー名・パスワードの確認
2. ドメイン名の確認（https://は不要）
3. アプリへのアクセス権限の確認
4. IPアドレス制限の確認
```

#### 3. ネットワークエラー

```bash
# 確認項目
1. --allow-netフラグにドメインが正しく指定されているか
2. プロキシ設定が必要な環境か
3. kintoneのメンテナンス情報を確認
```

#### 4. データ取得エラー

```bash
# 確認項目
1. アプリIDが正しいか
2. フィールドコードが正しいか
3. レコード数が多すぎないか（自動分割は動作するか）
```

## 🧑‍💻 開発者向け情報

### プロジェクト構成

```
kintone-deno-mcp-server/
├── server.js          # MCPサーバー実装（約1300行）
├── deno.json          # Deno設定ファイル
├── import_map.json    # インポートマップ（将来の拡張用）
├── package.json       # npm互換性のためのメタデータ
├── LICENSE            # MITライセンス
├── README.md          # このファイル
├── CLAUDE.md          # Claude Code向け開発ガイド
└── .gitignore         # Git除外設定
```

### 開発コマンド

```bash
# サーバー起動
deno task start

# コード整形
deno fmt

# Lint実行
deno lint

# 型チェック
deno check server.js

# 依存関係の更新確認
deno run --allow-net https://deno.land/x/udd/main.ts server.js
```

### アーキテクチャ

- **単一ファイル設計**: メンテナンスとデプロイの簡素化
- **ドメイン駆動設計**: 明確な責務分離
- **エラーハンドリング**: 詳細なログ出力
- **型安全**: TypeScriptの型推論を活用

## 📄 ライセンス

このプロジェクトは[MITライセンス](LICENSE)の下で公開されています。

## ⚠️ 注意事項

- **セキュリティ**: パスワードは平文で保存されるため、適切なファイルアクセス権限を設定してください
- **商標**: 「kintone」はサイボウズ株式会社の登録商標です
- **サポート**: 本プロジェクトはコミュニティプロジェクトであり、サイボウズ株式会社による公式サポートはありません
- **API制限**: kintone APIのレート制限に注意してください

## 🔗 関連リンク

- [Model Context Protocol](https://modelcontextprotocol.io/)
- [kintone API ドキュメント](https://cybozu.dev/ja/kintone/docs/overview/)
- [Deno公式サイト](https://deno.com/)
- [Claude](https://claude.ai/)
