# 契合 · AI 合同 App（拟定合同模块）

用一句话描述需求，AI 帮你拟定合同、生成可下载的 Word，或直接调取标准合同模板。
本仓库当前包含「拟定合同」这条主线的前端页面与后端代理。

## 目录结构

```
qiheAPP/
├── docs/                 计划文档与设计预览图
│   ├── 契合-拟定合同模块-最终计划.docx / .md
│   ├── preview-index.png
│   └── preview-talk.png
├── app/
│   ├── web/              前端（纯 HTML/CSS/JS，无需构建）
│   │   ├── index.html    首页
│   │   └── talk.html     对话页（对接后端，流式渲染、预览+下载）
│   └── server/           后端代理（Node.js + Express，安全对接 Dify）
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
cd app/server
npm install
cp .env.example .env      # 不填 Key 也能跑，会自动进入 mock 假数据模式
npm start
```

2. 打开前端：浏览器访问 `http://localhost:3000/index.html`（后端已同源托管前端）。

> 说明：不配置 `DIFY_API_KEY` 时后端自动进入 **mock 模式**，用假数据把「对话 → 追问 → 生成合同 → 预览 → 下载 / 模板」整条链路跑通，方便无 Key 调试。填入真实 Key 后即走真实 Dify。

## 与 Dify 的约定（标记协议）

Dify Chatflow 在对应分支输出时，用以下标记让前端识别结果类型：

- 生成合同终稿：`<<<CONTRACT_START>>> ...合同全文(Markdown)... <<<CONTRACT_END>>>`
- 返回合同模板：`<<<TEMPLATE:housing_lease>>>`（标识符须与 `app/server/templates/` 下的文件夹名一致）

前端会隐藏这些标记原文，并渲染「预览卡片 + Word 下载卡片」。

## 合同模板（方案 B）

模板是预先做好的真实 Word 文件，存放在 `app/server/templates/<id>/`：

```
templates/housing_lease/
├── meta.json       模板名称、描述
└── template.docx   正式定稿文件（当前为占位版本）
```

正式定稿的 Word 出来后，**直接覆盖 `template.docx` 即可**，无需改代码、无需重启逻辑。
预览由后端用 mammoth 实时从该文件转换，保证预览与下载内容一致。

## 后续（iOS 封装注意事项）

见 `app/server/README.md` 的「WKWebView 套壳注意事项」。
