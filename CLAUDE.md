# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

kintone（サイボウズ社のWebデータベースサービス）とModel Context Protocol (MCP)を連携させるDenoサーバー実装。Claude DesktopからkintoneのデータをAIで操作・分析可能にする。

- **GitHubリポジトリ**: https://github.com/r3-yamauchi/kintone-deno-mcp-server
- **ライセンス**: MIT
- **動作環境**: Deno v2.0+（現在v2.3.3で開発）
- **メインファイル**: server.js（約1300行）

## 環境構築

### 必須ツール
- Deno v2.0以降（推奨: v2.3以降）
- Git
- テキストエディタ（VSCode推奨、Deno拡張機能あり）

### セットアップ手順
```bash
# 1. リポジトリクローン
git clone https://github.com/r3-yamauchi/kintone-deno-mcp-server.git
cd kintone-deno-mcp-server

# 2. 環境変数設定（開発用）
export KINTONE_DOMAIN=dev-demo.cybozu.com
export KINTONE_USERNAME=demo-guest
export KINTONE_PASSWORD=demo-guest

# 3. サーバー起動
deno task start

# 4. 型チェック
deno check server.js
```

## 開発ワークフロー

### 基本コマンド
```bash
# サーバー起動（--allow-env --allow-net付き）
deno task start

# コード整形（Denoの標準フォーマッター）
deno fmt

# Lint実行（設定: deno.json）
deno lint

# 型チェック（TypeScript互換）
deno check server.js

# 依存関係更新チェック
deno run --allow-net https://deno.land/x/udd/main.ts server.js

# テスト実行（現在テストファイルなし）
deno test --allow-all
```

### Deno 2.x対応事項
- `deno.json`の`lint.files`は将来`lint.include`/`lint.exclude`に移行予定
- `process`グローバル警告は無視（Node.js互換レイヤーのため）
- npm specifierは`npm:`プレフィックスで使用

## アーキテクチャ詳細

### ファイル構造
```
server.js
├─ ヘッダー（ライセンス情報）
├─ インポート文
│  ├─ axios (npm:axios)
│  ├─ @modelcontextprotocol/sdk (npm:)
│  └─ MCP型定義
├─ ユーティリティ関数（20-60行）
│  ├─ toBase64()          # Base64エンコード
│  ├─ getEnv()            # 環境変数取得
│  └─ addSigintListener() # シグナルハンドリング
├─ ドメインモデル（61-76行）
│  ├─ KintoneCredentials  # 認証情報
│  └─ KintoneRecord       # レコードモデル
├─ KintoneRepository（77-576行）
│  └─ 全APIメソッド実装
├─ KintoneMCPServer（577-1290行）
│  ├─ constructor()       # 初期化・ツール定義
│  ├─ setupRequestHandlers() # ハンドラー登録
│  └─ run()              # サーバー起動
└─ エクスポート・起動（1291-1304行）
```

### クラス詳細

#### KintoneRepository（APIクライアント層）

**特徴**:
- 全メソッドがasync/await
- エラー時は詳細ログ出力（console.error）
- HTTPメソッドオーバーライド対応
- 自動バッチ処理実装

**メソッド一覧**:
```javascript
// レコード操作
getRecord(appId, recordId)                    // 単一取得
searchRecords(appId, query, fields, limit, offset) // 検索
getAllRecords(appId, query, fields)           // 全件取得（自動ページング）
createRecord(appId, fields)                   // 作成
addRecords(appId, records)                    // 一括作成（100件分割）
updateRecord(appId, recordId, fields, revision) // 更新
updateRecords(appId, updates)                 // 一括更新（100件分割）

// コメント・ステータス
getComments(appId, recordId, order, offset, limit) // コメント取得
addComment(appId, recordId, text, mentions)   // コメント追加
updateStatus(appId, recordId, action, assignee) // ステータス更新
updateStatuses(appId, updates)                // 一括ステータス更新

// アプリ・フィールド
getApp(appId)                                 // アプリ詳細
getApps(ids, codes, name, spaceIds, limit, offset) // アプリ一覧
getFormFields(appId, lang)                    // フィールド定義

// ファイル
uploadFile(fileName, fileData)                // アップロード
downloadFile(fileKey)                         // ダウンロード
```

#### KintoneMCPServer（MCPプロトコル実装）

**構成**:
```javascript
constructor() {
  // 1. MCPサーバー初期化
  this.server = new Server({
    name: "kintone-mcp-server",
    version: "0.1.0"
  });
  
  // 2. capabilities.toolsでツール定義（19個）
  // 3. 環境変数検証
  // 4. KintoneRepository初期化
  // 5. ハンドラー設定
}

setupRequestHandlers() {
  // ListToolsRequestSchema: ツール一覧返却
  // CallToolRequestSchema: ツール実行（switch文で分岐）
}

run() {
  // StdioServerTransportで標準入出力通信
}
```

### 実装パターン

#### 1. HTTPメソッドオーバーライド
```javascript
// kintone APIはGETでもPOSTを使用
const headers = {
    ...this.headers,
    "X-HTTP-Method-Override": "GET"
};
const response = await axios.post(url, data, { headers });
```

#### 2. バッチ処理（100件制限）
```javascript
const chunks = [];
for (let i = 0; i < records.length; i += 100) {
    chunks.push(records.slice(i, i + 100));
}
for (const chunk of chunks) {
    await processChunk(chunk);
}
```

#### 3. 自動ページング（500件制限）
```javascript
async getAllRecords(appId, query, fields = []) {
    const allRecords = [];
    let offset = 0;
    const limit = 500;
    let hasMore = true;
    
    while (hasMore) {
        const result = await this.searchRecords(appId, query, fields, limit, offset);
        allRecords.push(...result.records);
        offset += limit;
        hasMore = result.records.length === limit;
    }
    return allRecords;
}
```

#### 4. エラーハンドリング
```javascript
try {
    // API呼び出し
} catch (error) {
    console.error("Error details:", {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
    });
    throw new Error(`Failed to ${operation}: ${error.message}`);
}
```

## ツール実装ガイド

### 新規ツール追加の3ステップ

#### ステップ1: KintoneRepositoryにメソッド追加
```javascript
// server.js の KintoneRepository クラス内
async newApiMethod(param1, param2) {
    try {
        console.error(`Calling newApiMethod: ${param1}`);
        
        const requestData = {
            app: param1,
            field: param2
        };
        
        // GETの場合はオーバーライド
        const headers = {
            ...this.headers,
            "X-HTTP-Method-Override": "GET"
        };
        
        const response = await axios.post(
            `${this.baseUrl}/k/v1/newapi.json`,
            requestData,
            { headers }
        );
        
        return response.data;
    } catch (error) {
        console.error("Error details:", error.response?.data);
        throw new Error(`Failed to call newApiMethod: ${error.message}`);
    }
}
```

#### ステップ2: capabilities.toolsに定義追加
```javascript
// server.js の KintoneMCPServer constructor内
new_tool: {
    description: "新しいツールの説明（日本語）",
    inputSchema: {
        type: "object",
        properties: {
            param1: {
                type: "number",
                description: "パラメータ1の説明",
            },
            param2: {
                type: "string",
                description: "パラメータ2の説明",
            },
            optional_param: {
                type: "boolean",
                description: "オプションパラメータ",
                default: false,
            },
        },
        required: ["param1", "param2"],
    },
},
```

#### ステップ3: CallToolRequestSchemaにケース追加
```javascript
// server.js の setupRequestHandlers内のswitch文
case "new_tool": {
    const result = await this.repository.newApiMethod(
        request.params.arguments.param1,
        request.params.arguments.param2
    );
    return {
        content: [{
            type: "text",
            text: JSON.stringify(result, null, 2),
        }],
    };
}
```

## デバッグ・トラブルシューティング

### ログ戦略
```javascript
// 開発時のログ
console.error(`API Call: ${endpoint}`);          // API呼び出し
console.error(`Request:`, requestData);          // リクエスト内容
console.error(`Response:`, response.data);       // レスポンス
console.error(`Error:`, error.response?.data);   // エラー詳細
```

### よくあるエラーと対処法

#### 1. 環境変数エラー
```bash
# エラー: Missing required environment variables
# 対処: 環境変数を確認
echo $KINTONE_DOMAIN
echo $KINTONE_USERNAME
echo $KINTONE_PASSWORD
```

#### 2. ネットワーク権限エラー
```bash
# エラー: Requires net access to "xxx.cybozu.com"
# 対処: --allow-netにドメインを追加
deno run --allow-env --allow-net=xxx.cybozu.com server.js
```

#### 3. API制限エラー
```javascript
// エラー: GAIA_RE01: 制限値を超えています
// 対処: バッチサイズを確認
const MAX_BATCH_SIZE = 100;  // レコード操作
const MAX_GET_SIZE = 500;    // レコード取得
```

#### 4. 認証エラー
```javascript
// エラー: 401 Unauthorized
// 対処: Base64エンコードを確認
console.error("Auth header:", this.headers["X-Cybozu-Authorization"]);
```

## パフォーマンス最適化

### 現在の実装
- 逐次処理（並列処理なし）
- 同期的バッチ処理
- キャッシュなし

### 改善可能な領域
```javascript
// 1. 並列処理の実装
const results = await Promise.all(
    chunks.map(chunk => this.processChunk(chunk))
);

// 2. キャッシュの実装
const cache = new Map();
if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
}

// 3. ストリーミング対応
for await (const record of recordStream) {
    yield processRecord(record);
}
```

## セキュリティ考慮事項

### 実装済み対策
1. **ネットワーク分離**: `--allow-net=specific-domain.cybozu.com`
2. **環境変数管理**: ハードコーディング禁止
3. **エラーマスキング**: パスワード情報の非表示

### 追加推奨事項
```javascript
// 1. レート制限の実装
const rateLimiter = new RateLimiter({ 
    maxRequests: 100, 
    perMinutes: 1 
});

// 2. 入力検証の強化
function validateAppId(appId) {
    if (!Number.isInteger(appId) || appId < 1) {
        throw new Error("Invalid app ID");
    }
}

// 3. タイムアウト設定
const response = await axios.post(url, data, {
    headers,
    timeout: 30000  // 30秒
});
```

## テスト戦略（未実装）

### 推奨テスト構成
```javascript
// test/server_test.js
import { assertEquals } from "jsr:@std/assert";
import { KintoneRepository } from "../server.js";

Deno.test("KintoneRepository - getRecord", async () => {
    const repo = new KintoneRepository(mockCredentials);
    const record = await repo.getRecord(1, 1);
    assertEquals(record.appId, 1);
});
```

### モックサーバー案
```javascript
// test/mock_server.js
const mockServer = Deno.serve({ port: 8080 }, (req) => {
    const url = new URL(req.url);
    if (url.pathname === "/k/v1/record.json") {
        return new Response(JSON.stringify({ record: {} }));
    }
});
```

## 今後の拡張計画

### 短期目標
1. エラーハンドリングの改善
2. 入力検証の強化
3. ログレベルの制御
4. 基本的なテストの追加

### 中期目標
1. TypeScript完全移行
2. プラグインシステム
3. WebSocket対応
4. バルクAPI対応

### 長期目標
1. マルチテナント対応
2. OAuth認証対応
3. GraphQL APIラッパー
4. 監視・分析機能

## 貢献ガイドライン

### コーディング規約
- Deno標準のフォーマッターを使用
- 日本語コメントOK（ツール説明は日本語必須）
- エラーメッセージは英語
- console.errorでログ出力（MCP仕様）

### Pull Request手順
1. Issueで議論
2. feature/xxx ブランチ作成
3. 実装・テスト
4. `deno fmt` & `deno lint`
5. PR作成（日本語説明OK）

### レビューポイント
- [ ] 型安全性
- [ ] エラーハンドリング
- [ ] パフォーマンス影響
- [ ] 後方互換性
- [ ] ドキュメント更新