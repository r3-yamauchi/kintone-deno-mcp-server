/**
 * kintone MCP Server for Deno
 * 
 * Copyright (c) 2025 r3-yamauchi
 * This software is released under the MIT License.
 * https://opensource.org/licenses/MIT
 */

import axios from "npm:axios";
import { Server } from "npm:@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "npm:@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ErrorCode,
    ListToolsRequestSchema,
    McpError,
} from "npm:@modelcontextprotocol/sdk/types.js";

// Deno用: Bufferの代替（base64エンコード）
function toBase64(str) {
    if (typeof btoa !== "undefined") {
        return btoa(str);
    }
    // Deno環境でbtoaが未定義の場合
    if (typeof TextEncoder !== "undefined") {
        const bytes = new TextEncoder().encode(str);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        if (typeof btoa !== "undefined") {
            return btoa(binary);
        } else if (typeof globalThis !== "undefined" && typeof globalThis.btoa === "function") {
            return globalThis.btoa(binary);
        }
        throw new Error("Base64エンコード手段がありません");
    }
    throw new Error("Base64エンコード手段がありません");
}

// Deno用: 環境変数取得
function getEnv(name) {
    try {
        return Deno.env.get(name);
    } catch {
        // Denoの許可がない場合やNode.js互換時
        return undefined;
    }
}

// Deno用: シグナルハンドリング
function addSigintListener(handler) {
    if (typeof Deno !== "undefined" && Deno.addSignalListener) {
        Deno.addSignalListener("SIGINT", handler);
    } else if (typeof process !== "undefined" && process.on) {
        process.on("SIGINT", handler);
    }
}

// ドメインモデル
class KintoneCredentials {
    constructor(domain, username, password) {
        this.domain = domain;
        this.username = username;
        this.password = password;
        this.auth = toBase64(`${username}:${password}`);
    }
}

class KintoneRecord {
    constructor(appId, recordId, fields) {
        this.appId = appId;
        this.recordId = recordId;
        this.fields = fields;
    }
}

// リポジトリクラス
class KintoneRepository {
    constructor(credentials) {
        this.credentials = credentials;
        this.baseUrl = `https://${credentials.domain}`;
        this.headers = {
            "X-Cybozu-Authorization": this.credentials.auth,
            "Content-Type": "application/json"
        };
    }

    async getRecord(appId, recordId) {
        try {
            console.error(`Fetching record: ${appId}/${recordId}`);
            console.error(`URL: ${this.baseUrl}/k/v1/record.json`);

            const headers = {
                ...this.headers,
                "X-HTTP-Method-Override": "GET"
            };
            console.error(`Headers:`, headers);

            const response = await axios.post(`${this.baseUrl}/k/v1/record.json`, {
                app: appId,
                id: recordId
            }, {
                headers: headers
            });

            console.error("Response:", response.data);

            return new KintoneRecord(appId, recordId, response.data.record);
        } catch (error) {
            console.error("Error details:", {
                message: error.message,
                response: error.response?.data,
                status: error.response?.status,
                headers: error.response?.headers
            });
            throw new Error(`Failed to get record: ${error.message}`);
        }
    }

    async searchRecords(appId, query, fields = [], limit = 100, offset = 0) {
        try {
            const requestData = {
                app: appId,
                size: limit,
                offset: offset
            };

            if (query) {
                requestData.query = query;
            }

            if (fields.length > 0) {
                requestData.fields = fields;
            }

            console.error(`Searching records: ${appId}`);
            console.error(`Request data:`, requestData);

            const headers = {
                ...this.headers,
                "X-HTTP-Method-Override": "GET"
            };

            const response = await axios.post(`${this.baseUrl}/k/v1/records.json`,
                requestData,
                { headers: headers }
            );

            return {
                records: response.data.records.map(record => {
                    const recordId = record?.$id?.value || "unknown";
                    return new KintoneRecord(appId, recordId, record);
                }),
                totalCount: response.data.totalCount
            };
        } catch (error) {
            console.error("Error details:", {
                message: error.message,
                response: error.response?.data,
                status: error.response?.status
            });
            throw new Error(`Failed to search records: ${error.message}`);
        }
    }

    async getAllRecords(appId, query, fields = []) {
        try {
            const allRecords = [];
            let offset = 0;
            const limit = 500; // kintone の最大値
            let hasMore = true;

            while (hasMore) {
                const result = await this.searchRecords(appId, query, fields, limit, offset);
                allRecords.push(...result.records);
                
                offset += limit;
                hasMore = result.records.length === limit;
                
                console.error(`Fetched ${allRecords.length} records so far...`);
            }

            console.error(`Total records fetched: ${allRecords.length}`);
            return allRecords;
        } catch (error) {
            throw new Error(`Failed to get all records: ${error.message}`);
        }
    }

    async createRecord(appId, fields) {
        try {
            console.error(`Adding record in app: ${appId}`);
            console.error(`Fields:`, fields);

            const response = await axios.post(`${this.baseUrl}/k/v1/record.json`, {
                app: appId,
                record: fields
            }, {
                headers: this.headers
            });
            return response.data.id;
        } catch (error) {
            console.error("Error details:", {
                message: error.message,
                response: error.response?.data,
                status: error.response?.status
            });
            throw new Error(`Failed to create record: ${error.message}`);
        }
    }

    async addRecords(appId, records) {
        try {
            console.error(`Adding ${records.length} records in app: ${appId}`);
            
            // 100件ごとに分割（kintone APIの制限）
            const chunks = [];
            for (let i = 0; i < records.length; i += 100) {
                chunks.push(records.slice(i, i + 100));
            }
            
            const results = [];
            for (const chunk of chunks) {
                const response = await axios.post(`${this.baseUrl}/k/v1/records.json`, {
                    app: appId,
                    records: chunk
                }, {
                    headers: this.headers
                });
                results.push(...response.data.ids);
            }
            
            return results;
        } catch (error) {
            console.error("Error details:", {
                message: error.message,
                response: error.response?.data,
                status: error.response?.status
            });
            throw new Error(`Failed to add records: ${error.message}`);
        }
    }

    async updateRecord(appId, recordId, fields, revision = null) {
        try {
            console.error(`Updating record: ${appId}/${recordId}`);
            console.error(`Fields:`, fields);

            const requestData = {
                app: appId,
                id: recordId,
                record: fields
            };

            if (revision !== null) {
                requestData.revision = revision;
            }

            await axios.put(`${this.baseUrl}/k/v1/record.json`, requestData, {
                headers: this.headers
            });
        } catch (error) {
            console.error("Error details:", {
                message: error.message,
                response: error.response?.data,
                status: error.response?.status
            });
            throw new Error(`Failed to update record: ${error.message}`);
        }
    }

    async updateRecords(appId, updates) {
        try {
            console.error(`Updating ${updates.length} records in app: ${appId}`);
            
            // 100件ごとに分割（kintone APIの制限）
            const chunks = [];
            for (let i = 0; i < updates.length; i += 100) {
                chunks.push(updates.slice(i, i + 100));
            }
            
            const results = [];
            for (const chunk of chunks) {
                const response = await axios.put(`${this.baseUrl}/k/v1/records.json`, {
                    app: appId,
                    records: chunk
                }, {
                    headers: this.headers
                });
                results.push(...response.data.records);
            }
            
            return results;
        } catch (error) {
            console.error("Error details:", {
                message: error.message,
                response: error.response?.data,
                status: error.response?.status
            });
            throw new Error(`Failed to update records: ${error.message}`);
        }
    }

    async getComments(appId, recordId, order = "desc", offset = 0, limit = 10) {
        try {
            console.error(`Getting comments for record: ${appId}/${recordId}`);
            
            const headers = {
                ...this.headers,
                "X-HTTP-Method-Override": "GET"
            };

            const response = await axios.post(`${this.baseUrl}/k/v1/record/comments.json`, {
                app: appId,
                record: recordId,
                order: order,
                offset: offset,
                limit: limit
            }, {
                headers: headers
            });

            return response.data.comments;
        } catch (error) {
            console.error("Error details:", {
                message: error.message,
                response: error.response?.data,
                status: error.response?.status
            });
            throw new Error(`Failed to get comments: ${error.message}`);
        }
    }

    async addComment(appId, recordId, text, mentions = []) {
        try {
            console.error(`Adding comment to record: ${appId}/${recordId}`);
            
            const comment = {
                text: text
            };
            
            if (mentions.length > 0) {
                comment.mentions = mentions;
            }

            const response = await axios.post(`${this.baseUrl}/k/v1/record/comment.json`, {
                app: appId,
                record: recordId,
                comment: comment
            }, {
                headers: this.headers
            });

            return response.data.id;
        } catch (error) {
            console.error("Error details:", {
                message: error.message,
                response: error.response?.data,
                status: error.response?.status
            });
            throw new Error(`Failed to add comment: ${error.message}`);
        }
    }

    async updateStatus(appId, recordId, action, assignee = null) {
        try {
            console.error(`Updating status for record: ${appId}/${recordId}, action: ${action}`);
            
            const requestData = {
                app: appId,
                id: recordId,
                action: action
            };
            
            if (assignee !== null) {
                requestData.assignee = assignee;
            }

            const response = await axios.put(`${this.baseUrl}/k/v1/record/status.json`, requestData, {
                headers: this.headers
            });

            return response.data;
        } catch (error) {
            console.error("Error details:", {
                message: error.message,
                response: error.response?.data,
                status: error.response?.status
            });
            throw new Error(`Failed to update status: ${error.message}`);
        }
    }

    async updateStatuses(appId, updates) {
        try {
            console.error(`Updating statuses for ${updates.length} records in app: ${appId}`);
            
            // 100件ごとに分割（kintone APIの制限）
            const chunks = [];
            for (let i = 0; i < updates.length; i += 100) {
                chunks.push(updates.slice(i, i + 100));
            }
            
            const results = [];
            for (const chunk of chunks) {
                const response = await axios.put(`${this.baseUrl}/k/v1/records/status.json`, {
                    app: appId,
                    records: chunk
                }, {
                    headers: this.headers
                });
                results.push(...response.data.records);
            }
            
            return results;
        } catch (error) {
            console.error("Error details:", {
                message: error.message,
                response: error.response?.data,
                status: error.response?.status
            });
            throw new Error(`Failed to update statuses: ${error.message}`);
        }
    }

    async getApp(appId) {
        try {
            console.error(`Getting app info for ID: ${appId}`);
            
            const headers = {
                ...this.headers,
                "X-HTTP-Method-Override": "GET"
            };

            const response = await axios.post(`${this.baseUrl}/k/v1/app.json`, {
                id: appId
            }, {
                headers: headers
            });

            return response.data;
        } catch (error) {
            console.error("Error details:", {
                message: error.message,
                response: error.response?.data,
                status: error.response?.status
            });
            throw new Error(`Failed to get app info: ${error.message}`);
        }
    }

    async getApps(ids = null, codes = null, name = null, spaceIds = null, limit = 100, offset = 0) {
        try {
            const requestData = {
                limit: limit,
                offset: offset
            };

            if (ids) requestData.ids = ids;
            if (codes) requestData.codes = codes;
            if (name) requestData.name = name;
            if (spaceIds) requestData.spaceIds = spaceIds;

            console.error(`Getting apps with params:`, requestData);

            const headers = {
                ...this.headers,
                "X-HTTP-Method-Override": "GET"
            };

            const response = await axios.post(`${this.baseUrl}/k/v1/apps.json`, requestData, {
                headers: headers
            });

            return response.data;
        } catch (error) {
            console.error("Error details:", {
                message: error.message,
                response: error.response?.data,
                status: error.response?.status
            });
            throw new Error(`Failed to get apps: ${error.message}`);
        }
    }

    async getFormFields(appId, lang = null) {
        try {
            console.error(`Getting form fields for app: ${appId}`);
            
            const requestData = {
                app: appId
            };
            
            if (lang) requestData.lang = lang;

            const headers = {
                ...this.headers,
                "X-HTTP-Method-Override": "GET"
            };

            const response = await axios.post(`${this.baseUrl}/k/v1/app/form/fields.json`, requestData, {
                headers: headers
            });

            return response.data.properties;
        } catch (error) {
            console.error("Error details:", {
                message: error.message,
                response: error.response?.data,
                status: error.response?.status
            });
            throw new Error(`Failed to get form fields: ${error.message}`);
        }
    }

    async uploadFile(fileName, fileData) {
        try {
            console.error(`Uploading file: ${fileName}`);

            const headers = {
                ...this.headers,
                "Content-Type": "application/json"
            };

            const response = await axios.post(`${this.baseUrl}/k/v1/file.json`, {
                file: {
                    name: fileName,
                    data: fileData
                }
            }, {
                headers: headers
            });

            console.error("File upload response:", response.data);

            return response.data;
        } catch (error) {
            console.error("Error details:", {
                message: error.message,
                response: error.response?.data,
                status: error.response?.status
            });
            throw new Error(`Failed to upload file: ${error.message}`);
        }
    }

    async downloadFile(fileKey) {
        try {
            console.error(`Downloading file with key: ${fileKey}`);

            const headers = {
                ...this.headers,
                "X-HTTP-Method-Override": "GET"
            };

            const response = await axios.post(`${this.baseUrl}/k/v1/file.json`, {
                fileKey: fileKey
            }, {
                headers: headers,
                responseType: "arraybuffer"
            });

            console.error("File download response:", response);

            return response.data;
        } catch (error) {
            console.error("Error details:", {
                message: error.message,
                response: error.response?.data,
                status: error.response?.status
            });
            throw new Error(`Failed to download file: ${error.message}`);
        }
    }
}

class KintoneMCPServer {
    constructor() {
        this.server = new Server(
            {
                name: "kintone-mcp-server",
                version: "0.1.0",
            },
            {
                capabilities: {
                    tools: {
                        get_record: {
                            description: "kintoneアプリの1レコードを取得します",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    app_id: {
                                        type: "number",
                                        description: "kintoneアプリのID",
                                    },
                                    record_id: {
                                        type: "number",
                                        description: "レコードID",
                                    },
                                },
                                required: ["app_id", "record_id"],
                            },
                        },
                        search_records: {
                            description: "kintoneアプリのレコードを検索します（ページネーション対応）",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    app_id: {
                                        type: "number",
                                        description: "kintoneアプリのID",
                                    },
                                    query: {
                                        type: "string",
                                        description: "検索クエリ",
                                    },
                                    fields: {
                                        type: "array",
                                        items: {
                                            type: "string",
                                        },
                                        description: "取得するフィールド名の配列",
                                    },
                                    limit: {
                                        type: "number",
                                        description: "取得件数（デフォルト: 100、最大: 500）",
                                    },
                                    offset: {
                                        type: "number",
                                        description: "取得開始位置（デフォルト: 0）",
                                    },
                                },
                                required: ["app_id"],
                            },
                        },
                        create_record: {
                            description: "kintoneアプリに新しいレコードを作成します",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    app_id: {
                                        type: "number",
                                        description: "kintoneアプリのID",
                                    },
                                    fields: {
                                        type: "object",
                                        description: "レコードのフィールド値",
                                    },
                                },
                                required: ["app_id", "fields"],
                            },
                        },
                        get_all_records: {
                            description: "kintoneアプリの全レコードを自動的に取得します",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    app_id: {
                                        type: "number",
                                        description: "kintoneアプリのID",
                                    },
                                    query: {
                                        type: "string",
                                        description: "検索クエリ",
                                    },
                                    fields: {
                                        type: "array",
                                        items: {
                                            type: "string",
                                        },
                                        description: "取得するフィールド名の配列",
                                    },
                                },
                                required: ["app_id"],
                            },
                        },
                        add_records: {
                            description: "kintoneアプリに複数のレコードを一括追加します",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    app_id: {
                                        type: "number",
                                        description: "kintoneアプリのID",
                                    },
                                    records: {
                                        type: "array",
                                        description: "追加するレコードの配列",
                                    },
                                },
                                required: ["app_id", "records"],
                            },
                        },
                        update_record: {
                            description: "kintoneアプリの既存レコードを更新します",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    app_id: {
                                        type: "number",
                                        description: "kintoneアプリのID",
                                    },
                                    record_id: {
                                        type: "number",
                                        description: "レコードID",
                                    },
                                    fields: {
                                        type: "object",
                                        description: "更新するフィールド値",
                                    },
                                    revision: {
                                        type: "number",
                                        description: "レコードのリビジョン番号（楽観的ロック用）",
                                    },
                                },
                                required: ["app_id", "record_id", "fields"],
                            },
                        },
                        update_records: {
                            description: "kintoneアプリの複数レコードを一括更新します",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    app_id: {
                                        type: "number",
                                        description: "kintoneアプリのID",
                                    },
                                    updates: {
                                        type: "array",
                                        description: "更新するレコードの配列（各要素にid、record、revisionを含む）",
                                    },
                                },
                                required: ["app_id", "updates"],
                            },
                        },
                        get_comments: {
                            description: "レコードのコメントを取得します",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    app_id: {
                                        type: "number",
                                        description: "kintoneアプリのID",
                                    },
                                    record_id: {
                                        type: "number",
                                        description: "レコードID",
                                    },
                                    order: {
                                        type: "string",
                                        description: "並び順（desc: 降順、asc: 昇順）",
                                        default: "desc",
                                    },
                                    offset: {
                                        type: "number",
                                        description: "取得開始位置",
                                        default: 0,
                                    },
                                    limit: {
                                        type: "number",
                                        description: "取得件数（最大10）",
                                        default: 10,
                                    },
                                },
                                required: ["app_id", "record_id"],
                            },
                        },
                        add_comment: {
                            description: "レコードにコメントを追加します",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    app_id: {
                                        type: "number",
                                        description: "kintoneアプリのID",
                                    },
                                    record_id: {
                                        type: "number",
                                        description: "レコードID",
                                    },
                                    text: {
                                        type: "string",
                                        description: "コメント本文",
                                    },
                                    mentions: {
                                        type: "array",
                                        description: "メンション情報の配列",
                                    },
                                },
                                required: ["app_id", "record_id", "text"],
                            },
                        },
                        update_status: {
                            description: "レコードのステータスを更新します",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    app_id: {
                                        type: "number",
                                        description: "kintoneアプリのID",
                                    },
                                    record_id: {
                                        type: "number",
                                        description: "レコードID",
                                    },
                                    action: {
                                        type: "string",
                                        description: "アクション名",
                                    },
                                    assignee: {
                                        type: "string",
                                        description: "作業者のログイン名",
                                    },
                                },
                                required: ["app_id", "record_id", "action"],
                            },
                        },
                        update_statuses: {
                            description: "複数レコードのステータスを一括更新します",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    app_id: {
                                        type: "number",
                                        description: "kintoneアプリのID",
                                    },
                                    updates: {
                                        type: "array",
                                        description: "更新するステータスの配列（各要素にid、action、assigneeを含む）",
                                    },
                                },
                                required: ["app_id", "updates"],
                            },
                        },
                        get_app: {
                            description: "アプリの詳細情報を取得します",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    app_id: {
                                        type: "number",
                                        description: "kintoneアプリのID",
                                    },
                                },
                                required: ["app_id"],
                            },
                        },
                        get_apps: {
                            description: "アプリ一覧を取得します（検索対応）",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    ids: {
                                        type: "array",
                                        items: {
                                            type: "number",
                                        },
                                        description: "アプリIDの配列",
                                    },
                                    codes: {
                                        type: "array",
                                        items: {
                                            type: "string",
                                        },
                                        description: "アプリコードの配列",
                                    },
                                    name: {
                                        type: "string",
                                        description: "アプリ名（部分一致）",
                                    },
                                    spaceIds: {
                                        type: "array",
                                        items: {
                                            type: "number",
                                        },
                                        description: "スペースIDの配列",
                                    },
                                    limit: {
                                        type: "number",
                                        description: "取得件数（デフォルト: 100、最大: 100）",
                                    },
                                    offset: {
                                        type: "number",
                                        description: "取得開始位置（デフォルト: 0）",
                                    },
                                },
                            },
                        },
                        get_form_fields: {
                            description: "アプリのフォームフィールド情報を取得します",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    app_id: {
                                        type: "number",
                                        description: "kintoneアプリのID",
                                    },
                                    lang: {
                                        type: "string",
                                        description: "言語（ja、en、zh、user）",
                                    },
                                },
                                required: ["app_id"],
                            },
                        },
                        get_apps_info: {
                            description: "アプリ名で検索してkintoneアプリの情報を取得します（簡易版）",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    app_name: {
                                        type: "string",
                                        description: "アプリ名またはその一部",
                                    },
                                },
                                required: ["app_name"],
                            },
                        },
                        download_file: {
                            description: "kintoneアプリからファイルをダウンロードします",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    file_key: {
                                        type: "string",
                                        description: "ダウンロードするファイルのキー",
                                    },
                                },
                                required: ["file_key"],
                            },
                        },
                        upload_file: {
                            description: "kintoneアプリにファイルをアップロードします",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    file_name: {
                                        type: "string",
                                        description: "アップロードするファイルの名前",
                                    },
                                    file_data: {
                                        type: "string",
                                        description: "Base64エンコードされたファイルデータ",
                                    },
                                },
                                required: ["file_name", "file_data"],
                            },
                        },
                    },
                },
            }
        );

        // 環境変数のバリデーション
        const requiredEnvVars = ["KINTONE_DOMAIN", "KINTONE_USERNAME", "KINTONE_PASSWORD"];
        const missingEnvVars = requiredEnvVars.filter(envVar => !getEnv(envVar));

        if (missingEnvVars.length > 0) {
            throw new Error("Missing required environment variables: " + missingEnvVars.join(", "));
        }

        this.credentials = new KintoneCredentials(
            getEnv("KINTONE_DOMAIN"),
            getEnv("KINTONE_USERNAME"),
            getEnv("KINTONE_PASSWORD")
        );

        this.repository = new KintoneRepository(this.credentials);

        this.setupRequestHandlers();

        // エラーハンドリング
        this.server.onerror = (error) => console.error("[MCP Error]", error);

        addSigintListener(async () => {
            await this.server.close();
            if (typeof Deno !== "undefined" && Deno.exit) {
                Deno.exit(0);
            } else if (typeof process !== "undefined" && process.exit) {
                process.exit(0);
            }
        });
    }

    setupRequestHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, () => ({
            tools: Object.values(this.server.capabilities.tools)
        }));

        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            try {
                console.error("Tool request:", {
                    name: request.params.name,
                    arguments: request.params.arguments
                });

                switch (request.params.name) {
                    case "get_record": {
                        const record = await this.repository.getRecord(
                            request.params.arguments.app_id,
                            request.params.arguments.record_id
                        );
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: JSON.stringify(record.fields, null, 2),
                                },
                            ],
                        };
                    }

                    case "search_records": {
                        const result = await this.repository.searchRecords(
                            request.params.arguments.app_id,
                            request.params.arguments.query,
                            request.params.arguments.fields,
                            request.params.arguments.limit,
                            request.params.arguments.offset
                        );
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: JSON.stringify({
                                        records: result.records.map((r) => r.fields),
                                        totalCount: result.totalCount
                                    }, null, 2),
                                },
                            ],
                        };
                    }

                    case "get_all_records": {
                        const records = await this.repository.getAllRecords(
                            request.params.arguments.app_id,
                            request.params.arguments.query,
                            request.params.arguments.fields
                        );
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: JSON.stringify(
                                        records.map((r) => r.fields),
                                        null,
                                        2
                                    ),
                                },
                            ],
                        };
                    }

                    case "create_record": {
                        const recordId = await this.repository.createRecord(
                            request.params.arguments.app_id,
                            request.params.arguments.fields
                        );
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: JSON.stringify({ record_id: recordId }, null, 2),
                                },
                            ],
                        };
                    }

                    case "add_records": {
                        const recordIds = await this.repository.addRecords(
                            request.params.arguments.app_id,
                            request.params.arguments.records
                        );
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: JSON.stringify({ record_ids: recordIds }, null, 2),
                                },
                            ],
                        };
                    }

                    case "update_record": {
                        await this.repository.updateRecord(
                            request.params.arguments.app_id,
                            request.params.arguments.record_id,
                            request.params.arguments.fields,
                            request.params.arguments.revision
                        );
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: JSON.stringify({ success: true }, null, 2),
                                },
                            ],
                        };
                    }

                    case "update_records": {
                        const results = await this.repository.updateRecords(
                            request.params.arguments.app_id,
                            request.params.arguments.updates
                        );
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: JSON.stringify({ results }, null, 2),
                                },
                            ],
                        };
                    }

                    case "get_comments": {
                        const comments = await this.repository.getComments(
                            request.params.arguments.app_id,
                            request.params.arguments.record_id,
                            request.params.arguments.order,
                            request.params.arguments.offset,
                            request.params.arguments.limit
                        );
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: JSON.stringify(comments, null, 2),
                                },
                            ],
                        };
                    }

                    case "add_comment": {
                        const commentId = await this.repository.addComment(
                            request.params.arguments.app_id,
                            request.params.arguments.record_id,
                            request.params.arguments.text,
                            request.params.arguments.mentions
                        );
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: JSON.stringify({ comment_id: commentId }, null, 2),
                                },
                            ],
                        };
                    }

                    case "update_status": {
                        const result = await this.repository.updateStatus(
                            request.params.arguments.app_id,
                            request.params.arguments.record_id,
                            request.params.arguments.action,
                            request.params.arguments.assignee
                        );
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: JSON.stringify(result, null, 2),
                                },
                            ],
                        };
                    }

                    case "update_statuses": {
                        const results = await this.repository.updateStatuses(
                            request.params.arguments.app_id,
                            request.params.arguments.updates
                        );
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: JSON.stringify({ results }, null, 2),
                                },
                            ],
                        };
                    }

                    case "get_app": {
                        const appInfo = await this.repository.getApp(
                            request.params.arguments.app_id
                        );
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: JSON.stringify(appInfo, null, 2),
                                },
                            ],
                        };
                    }

                    case "get_apps": {
                        const apps = await this.repository.getApps(
                            request.params.arguments.ids,
                            request.params.arguments.codes,
                            request.params.arguments.name,
                            request.params.arguments.spaceIds,
                            request.params.arguments.limit,
                            request.params.arguments.offset
                        );
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: JSON.stringify(apps, null, 2),
                                },
                            ],
                        };
                    }

                    case "get_form_fields": {
                        const fields = await this.repository.getFormFields(
                            request.params.arguments.app_id,
                            request.params.arguments.lang
                        );
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: JSON.stringify(fields, null, 2),
                                },
                            ],
                        };
                    }

                    case "get_apps_info": {
                        const apps = await this.repository.getApps(
                            null,
                            null,
                            request.params.arguments.app_name,
                            null,
                            100,
                            0
                        );
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: JSON.stringify(apps, null, 2),
                                },
                            ],
                        };
                    }

                    case "upload_file": {
                        const response = await this.repository.uploadFile(
                            request.params.arguments.file_name,
                            request.params.arguments.file_data
                        );
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: JSON.stringify({ file_key: response.fileKey }, null, 2),
                                },
                            ],
                        };
                    }

                    case "download_file": {
                        const fileData = await this.repository.downloadFile(
                            request.params.arguments.file_key
                        );
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: typeof fileData === "string"
                                        ? fileData
                                        : (fileData instanceof Uint8Array
                                            ? btoa(String.fromCharCode(...fileData))
                                            : fileData.toString("base64")),
                                },
                            ],
                        };
                    }

                    default:
                        throw new McpError(
                            ErrorCode.MethodNotFound,
                            `Unknown tool: ${request.params.name}`
                        );
                }
            } catch (error) {
                console.error("Error in tool execution:", error);
                throw new McpError(
                    ErrorCode.InternalError,
                    error.message
                );
            }
        });
    }

    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error("Kintone MCP server running on stdio");
    }
}

// サーバーの起動
const server = new KintoneMCPServer();
server.run().catch(console.error);

export {
    KintoneCredentials,
    KintoneRecord,
    KintoneRepository,
    KintoneMCPServer
};
