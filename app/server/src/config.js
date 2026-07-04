import dotenv from 'dotenv';

dotenv.config();

function parseBool(value) {
  if (value === undefined || value === null || value === '') return undefined;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

const DIFY_API_KEY = (process.env.DIFY_API_KEY || '').trim();

// mock 优先级：显式 MOCK 环境变量 > 是否配置了 Key。
// 未显式设置时：没有 Key 就自动进入 mock，方便无 Key 调试前端。
const explicitMock = parseBool(process.env.MOCK);
const MOCK = explicitMock !== undefined ? explicitMock : DIFY_API_KEY === '';

const config = {
  port: Number(process.env.PORT) || 3000,
  difyBaseUrl: (process.env.DIFY_BASE_URL || 'https://api.dify.ai/v1').replace(/\/+$/, ''),
  difyApiKey: DIFY_API_KEY,
  mock: MOCK,
  corsOrigins: (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};

export default config;
