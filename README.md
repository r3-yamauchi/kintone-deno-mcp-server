# MCP server for kintone by Deno サンプル

これは [kintone](https://kintone.cybozu.co.jp/) との連携目的で使用できる [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) サーバーを Deno で動くようにしたサンプルです。
Deno では対象の kintoneドメインのみと通信許可する設定ができるので、セキュリティ面の懸念材料が減っています。

## 使い方

### 1. ソースコードをダウンロードする

ダウンロード先はどこでも構いませんが、半角英数のみで構成される、あいだにスペースを含まないパスに入れるのが良いと思います。

### 2. Deno（v1.40以降推奨） をインストールする

[公式サイト](https://deno.com/manual@v1.40.0/getting_started/installation)の手順に従ってDenoをインストールしてください。

### 3. Denoサーバーの起動

プロジェクトディレクトリで以下のコマンドを実行します。

```bash
export KINTONE_DOMAIN=dev-demo.cybozu.com
export KINTONE_USERNAME=demo-guest
export KINTONE_PASSWORD=demo-guest
deno task start
```

> ※初回実行時はnpmパッケージ利用の許可を求められる場合があります。`--allow-env --allow-net` 権限が必要です。

### 4. Claude Desktopアプリの設定ファイルを編集する

claude_desktop_config.json という設定ファイルを探して、以下を参考に、このファイルの "mcpServers" の項に設定を追加してください。

```json
{
  "mcpServers": {
    "kintone": {
      "command": "deno",
      "env": {
        "KINTONE_DOMAIN": "[あなたが使用するサブドメイン].cybozu.com",
        "KINTONE_USERNAME": "MCP接続で使用するkintoneユーザー名",
        "KINTONE_PASSWORD": "kintoneユーザーのパスワード（平文）"
      },
      "args": [
        "run",
        "--allow-env",
        "--allow-net=[あなたが使用するサブドメイン].cybozu.com",
        "[kintone-deno-mcp-serverを配置したパス]/server.js"
      ]
    }
  }
}
```

### 5. Claude Desktopアプリを再起動する

claude_desktop_config.json への変更を保存したのち、Claude Desktopアプリを一度終了させて再起動してください。
アプリを終了させたように見えても常駐したまま残っている場合があるため、常駐アイコンを右クリックしてQuitしてください。

### 6. 動作確認

まずは Claude に "kintoneアプリ「設定したkintoneユーザーでアクセス出来るアプリ名の一例」のアプリIDを調べて" と尋ねてみてください。
ここで入力するkintoneアプリ名は一言一句正確に指定する必要があります。

** 「kintone」はサイボウズ株式会社の登録商標です。

ここに記載している内容は情報提供を目的としており、個別のサポートはできません。
設定内容についてのご質問やご自身の環境で動作しないといったお問い合わせをいただいても対応はできませんので、ご了承ください。
