# 契合 · AI 合同助手

用一句话描述需求，AI 帮你拟定合同、生成可下载的 Word，或直接调取标准合同模板。
本仓库包含 App 移动端 + Web 桌面端两个前端版本，以及 Node.js 后端代理。

## 目录结构

```
qiheAPP/
├── docs/                             项目文档
│   ├── 计划-拟定合同模块.md / .docx   最终搭建计划
│   ├── 接入-API-Key调试.md            API 接入与调试指南
│   ├── dify-workflow.yml             Dify Chatflow 工作流配置
│   ├── preview-homepage.png           首页预览图
│   └── preview-chat.png              对话页预览图
│
├── app/                              App 移动端（单页应用，dc-runtime 驱动）
│   ├── index.html                    主页面（含首页 + 对话 + 合同预览）
│   ├── api-client.js                 API 桥接层（SSE 流式、合同导出、模板下载）
│   └── assets/
│       └── qihe-logo.png
│
├── web/                              Web 桌面端（单页应用，dc-runtime 驱动）
│   ├── index.html                    主页面
│   └── api-client.js                 API 桥接层
│
├── server/                           后端代理（Node.js + Express）
│   ├── src/
│   │   ├── index.js                  Express 入口 + 静态文件托管
│   │   ├── config.js                 环境变量 + mock 开关
│   │   ├── routes/
│   │   │   ├── chat.js               POST /api/chat（SSE 流式）
│   │   │   ├── export.js             POST /api/export-docx
│   │   │   └── templates.js          GET /api/templates
│   │   └── services/
│   │       └── difyClient.js          Dify 请求封装 + mock
│   ├── templates/
│   │   └── housing_lease/            合同模板库
│   │       ├── meta.json
│   │       └── template.docx
│   └── scripts/
│
├── _archive/                         历史归档（仅供参考，不参与构建）
│   ├── legacy-v1/                    旧版 v1 双页面架构
│   │   ├── homepage.html
│   │   └── chat.html
│   └── design-sources/               设计稿源文件（.dc.html + dc-runtime）
│       ├── support.js
│       ├── 合同助手-首页.dc.html
│       ├── 合同助手-App首页.dc.html
│       ├── 契合-Web版.dc.html
│       └── ios-device-frame.jsx
│
├── .gitignore
└── README.md
```

## 整体链路

```
浏览器 / iOS App(WKWebView)
        │  POST /api/chat（SSE 流式）
        ▼
Node 后端代理（持有 Dify Key）
        │  POST /v1/chat-messages（streaming）
        ▼
     Dify Chatflow → 大模型
```

前端不直接接触 Dify Key；所有请求经后端转发，规避公开仓库密钥泄露风险。

## 快速开始（本地）

1. 启动后端：

```bash
cd server
npm install
cp .env.example .env      # 不填 Key 也能跑，会自动进入 mock 假数据模式
npm start
```

2. 打开前端：
   - App 移动端：`http://localhost:3000/`
   - Web 桌面端：`http://localhost:3000/web`

> 说明：不配置 `DIFY_API_KEY` 时后端自动进入 **mock 模式**，用假数据把「对话 → 追问 → 生成合同 → 预览 → 下载 / 模板」整条链路跑通，方便无 Key 调试。填入真实 Key 后即走真实 Dify。

## 与 Dify 的约定（标记协议）

Dify Chatflow 在对应分支输出时，用以下标记让前端识别结果类型：

- 生成合同终稿：`<<<CONTRACT_START>>> ...合同全文(Markdown)... <<<CONTRACT_END>>>`
- 返回合同模板：`<<<TEMPLATE:housing_lease>>>`（标识符须与 `server/templates/` 下的文件夹名一致）

前端会隐藏这些标记原文，并渲染「预览卡片 + Word 下载卡片」。

## 合同模板（方案 B）

模板是预先做好的真实 Word 文件，存放在 `server/templates/<id>/`：

```
templates/housing_lease/
├── meta.json       模板名称、描述
└── template.docx   正式定稿文件（当前为占位版本）
```

正式定稿的 Word 出来后，**直接覆盖 `template.docx` 即可**，无需改代码、无需重启逻辑。
预览由后端用 mammoth 实时从该文件转换，保证预览与下载内容一致。

## 后续（iOS 封装注意事项）

见 `server/README.md` 的「WKWebView 套壳注意事项」。
