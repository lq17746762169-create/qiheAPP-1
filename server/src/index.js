import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config from './config.js';
import chatRouter from './routes/chat.js';
import exportRouter from './routes/export.js';
import templatesRouter from './routes/templates.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(__dirname, '../../app');
const WEB_DIR = path.resolve(__dirname, '../../web');

const app = express();
app.disable('x-powered-by');

// CORS：允许配置的来源；未配置时允许全部。
// WKWebView 加载本地打包页面时 origin 为 "null"（字符串）或缺失，需放行。
const corsOptions = {
  origin(origin, callback) {
    if (config.corsOrigins.length === 0) return callback(null, true);
    if (!origin || origin === 'null') return callback(null, true);
    if (config.corsOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`Origin not allowed by CORS: ${origin}`));
  },
};
app.use(cors(corsOptions));

app.use(express.json({ limit: '5mb' }));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, mock: config.mock });
});

app.use('/api/chat', chatRouter);
app.use('/api/export-docx', exportRouter);
app.use('/api/templates', templatesRouter);

// 同源托管前端：App 移动端 + Web 桌面端
// App 同时映射到 / 和 /app，确保相对路径资源正确加载
app.use(express.static(APP_DIR));
app.use('/app', express.static(APP_DIR));
app.use('/web', express.static(WEB_DIR));
app.get('/', (req, res) => res.sendFile(path.join(APP_DIR, 'index.html')));

app.use((err, req, res, next) => {
  console.error('[error]', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

app.listen(config.port, () => {
  console.log(`\n契合后端已启动: http://localhost:${config.port}`);
  console.log(`App 移动端:     http://localhost:${config.port}/`);
  console.log(`Web 桌面端:     http://localhost:${config.port}/web`);
  console.log(`运行模式:       ${config.mock ? 'MOCK（假数据，无需 Dify Key）' : '真实 Dify'}`);
  if (!config.mock) console.log(`Dify:          ${config.difyBaseUrl}`);
  console.log('');
});
