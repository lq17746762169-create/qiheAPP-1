# 契合后端代理

Node.js + Express，职责单一：安全转发 Dify Chatflow 请求、生成合同 Word、提供合同模板库。
不掺杂业务判断（说什么、问几轮、什么格式，全部由 Dify workflow 决定）。

## 启动

```bash
npm install
cp .env.example .env
npm start        # 或 npm run dev（--watch 热重载）
```

启动后：
- App 移动端：`http://localhost:3000/`
- Web 桌面端：`http://localhost:3000/web`
- 健康检查：`http://localhost:3000/api/health`

## 环境变量（.env）

| 变量 | 说明 |
| --- | --- |
| `DIFY_BASE_URL` | Dify API 地址，默认 `https://api.dify.ai/v1` |
| `DIFY_API_KEY` | Dify 应用 Service API Key。**留空则自动进入 mock 模式** |
| `PORT` | 监听端口，默认 3000 |
| `MOCK` | 强制 mock 开关（true/false）。不设置时按有无 Key 自动判断 |
| `CORS_ORIGINS` | 允许的跨域来源，逗号分隔；留空允许全部。WKWebView 的 `null` 源已内置放行 |

> 安全提醒：`.env` 已被 `.gitignore` 排除。本仓库为公开开源仓库，切勿把真实 Key 写入任何会提交的文件。

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查，返回是否 mock |
| POST | `/api/chat` | 聊天，SSE 流式返回。body：`{ query, conversationId, user }` |
| POST | `/api/export-docx` | 合同文本生成 Word。body：`{ content, filename?, appendSignature? }` |
| GET | `/api/templates` | 模板列表 |
| GET | `/api/templates/:id` | 模板元信息 + HTML 预览（mammoth 实时转换） |
| GET | `/api/templates/:id/download` | 下载模板原文件 |

## mock 模式说明

未配置 Key 时，`/api/chat` 会根据输入返回不同假数据，便于验证四类结果：
- 含「模板」二字 → 返回 `<<<TEMPLATE:housing_lease>>>`
- 信息较完整（含甲方/乙方/租金等或较长）→ 返回带 `<<<CONTRACT_START/END>>>` 的合同终稿
- 其它 → 返回多轮追问

## 合同模板管理

- 新增/更新模板 = 在 `templates/<id>/` 放 `meta.json` + `template.docx`，无需改代码。
- 占位模板可用 `npm run gen:placeholder` 重新生成。
- `<id>` 需与 Dify 输出的 `<<<TEMPLATE:id>>>` 完全一致（建议英文小写+下划线）。

## 部署（以后需要时）

任意常驻 Node 平台（Render / Railway 等）均可，要点：
- 必须 HTTPS（iOS ATS 要求）。
- 配置环境变量 `DIFY_API_KEY` 等。
- 部署后把前端 `api-client.js` 里的 `REMOTE_API` 改成线上后端地址。

## WKWebView 套壳注意事项（交给负责 Xcode 封装的同学）

1. **持久化存储**：创建 WKWebView 时使用 `WKWebsiteDataStore.default()`（而非 `.nonPersistent()`），否则 `localStorage` 里的对话历史会在 App 关闭后丢失。
2. **网络 HTTPS**：iOS ATS 默认禁止非 HTTPS 请求；后端务必用 HTTPS 地址，不要用 `http://localhost` 在真机上跑。
3. **文件下载**：WKWebView 默认不会像浏览器那样弹出下载。需实现 `WKDownloadDelegate`（或拦截 blob/attachment 响应），把 Word 文件保存到「文件」App 或弹出系统分享面板。
4. **流式**：前端用 `fetch` + `ReadableStream` 读取 SSE（非 `EventSource`），兼容性更好。
