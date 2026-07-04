# 契合 · API Key 接入与调试步骤

本模块支持「填入 Key 即调真实 Dify，留空则自动 mock」。
上传到仓库的版本永远是 mock 版（因为 `.env` 已被 `.gitignore` 忽略，Key 不会进仓库）。

---

## 一、准备工作（只需一次）

```bash
cd server
npm install          # 安装依赖（已装过可跳过）
```

`.env` 文件已经建好，位于 `server/.env`。如果没有，可从模板复制：

```bash
cp .env.example .env
```

---

## 二、填入 API Key（切换到真实 Dify）

1. 打开 `server/.env`。
2. 找到这一行，把 Key 粘贴在等号后面：

```
DIFY_API_KEY=app-你的真实Key
```

> Key 获取：Dify 后台打开「契合」这个应用 → 左侧「访问 API」→ 生成/复制 API Key（形如 `app-xxxxxxxx`）。

3. 保存文件。

---

## 三、启动 / 重启后端

```bash
cd server
npm start
```

启动日志里会显示运行模式：
- `运行模式: 真实 Dify` → Key 已生效。
- `运行模式: MOCK（假数据）` → 没读到 Key，仍是假数据。

改完 `.env` 必须**重启**后端才会生效（Ctrl+C 停掉再 `npm start`）。

---

## 四、体验

- App 移动端：`http://localhost:3000/`
- Web 桌面端：`http://localhost:3000/web`

> 两个前端版本共用同一套后端 API。API 桥接层 (`api-client.js`) 会在页面渲染后自动加载并连接后端。

---

## 五、Dify 侧需要配合的事（给 workflow 负责人）

前端靠两个「标记」来识别结果、触发合同预览和 Word 下载。请在 Dify workflow 对应分支的输出里加上：

1. **生成合同终稿时**，把完整合同用标记包起来：

```
<<<CONTRACT_START>>>
（这里是完整合同全文，Markdown 格式）
<<<CONTRACT_END>>>
```

2. **返回合同模板时**，只需输出一个标识符（不要输出模板全文）：

```
<<<TEMPLATE:housing_lease>>>
```

> 说明：
> - 只填 Key、Dify 没加标记 → 能和真实 AI 正常聊天、也能收到合同全文，但不会自动弹出「预览卡片 + Word 下载」。
> - 填 Key + Dify 加了标记 → 完整效果（真实聊天 + 预览 + 下载）全部生效，前端无需再改动。
> - `housing_lease` 这个标识符要和后端 `server/templates/` 下的文件夹名完全一致。

---

## 六、安全提醒

- 真实 Key 只写在本地 `server/.env`，**不要**写进任何会 commit 的文件（本仓库是公开开源仓库）。
- `.env` 已在 `.gitignore` 中，正常操作不会被提交。
