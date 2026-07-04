import { Router } from 'express';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import mammoth from 'mammoth';

const router = Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.resolve(__dirname, '../../templates');

// 仅允许安全的模板 id（英文小写、数字、下划线、连字符），防止路径穿越
function safeId(id) {
  return typeof id === 'string' && /^[a-z0-9_-]+$/i.test(id) ? id : null;
}

async function readMeta(id) {
  const metaPath = path.join(TEMPLATES_DIR, id, 'meta.json');
  if (!existsSync(metaPath)) return null;
  try {
    const raw = await fs.readFile(metaPath, 'utf-8');
    const meta = JSON.parse(raw);
    return { id, name: meta.name || id, description: meta.description || '', updatedAt: meta.updatedAt || '' };
  } catch {
    return { id, name: id, description: '', updatedAt: '' };
  }
}

function docxPath(id) {
  return path.join(TEMPLATES_DIR, id, 'template.docx');
}

// GET /api/templates —— 模板列表
router.get('/', async (req, res) => {
  try {
    if (!existsSync(TEMPLATES_DIR)) return res.json({ templates: [] });
    const entries = await fs.readdir(TEMPLATES_DIR, { withFileTypes: true });
    const list = [];
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const meta = await readMeta(e.name);
      if (meta) list.push(meta);
    }
    res.json({ templates: list });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/templates/:id —— 元信息 + HTML 预览（用 mammoth 实时转换 docx）
router.get('/:id', async (req, res) => {
  const id = safeId(req.params.id);
  if (!id) return res.status(400).json({ error: '非法的模板 id' });

  const meta = await readMeta(id);
  if (!meta) return res.status(404).json({ error: '模板不存在' });

  const file = docxPath(id);
  if (!existsSync(file)) return res.status(404).json({ error: '模板文件缺失' });

  try {
    const { value: html } = await mammoth.convertToHtml({ path: file });
    res.json({ ...meta, filename: `${meta.name}.docx`, previewHtml: html });
  } catch (err) {
    res.status(500).json({ error: `预览生成失败: ${err.message}` });
  }
});

// GET /api/templates/:id/download —— 原文件下载
router.get('/:id/download', async (req, res) => {
  const id = safeId(req.params.id);
  if (!id) return res.status(400).json({ error: '非法的模板 id' });

  const meta = await readMeta(id);
  const file = docxPath(id);
  if (!meta || !existsSync(file)) return res.status(404).json({ error: '模板文件不存在' });

  const encoded = encodeURIComponent(`${meta.name}.docx`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="template.docx"; filename*=UTF-8''${encoded}`);
  createReadStream(file).pipe(res);
});

export default router;
