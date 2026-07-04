import { Router } from 'express';
import { createChatStream } from '../services/difyClient.js';

const router = Router();

router.post('/', async (req, res) => {
  const { query, conversationId, user } = req.body || {};

  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'query 不能为空' });
  }

  // SSE 响应头：关闭缓冲/压缩，保证流式打字机效果
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const stream = createChatStream({
    query,
    conversationId: conversationId || '',
    user: user || 'anonymous',
  });

  // 客户端断开时停止推送。用 res 的 close 事件判断（response 结束前关闭 = 客户端主动断开）。
  let aborted = false;
  res.on('close', () => { if (!res.writableFinished) aborted = true; });

  try {
    for await (const chunk of stream) {
      if (aborted || res.destroyed) break;
      res.write(chunk);
      res.flush?.();
    }
  } catch (err) {
    console.error('[chat] stream error:', err);
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ event: 'error', message: err.message || '生成失败' })}\n\n`);
    }
  } finally {
    if (!res.writableEnded) res.end();
  }
});

export default router;
