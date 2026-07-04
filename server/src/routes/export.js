import { Router } from 'express';
import {
  Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle,
} from 'docx';

const router = Router();

const CN = 'PingFang SC';
const INK = '1A2233';
const BRAND = '3A67DC';

// 解析行内 **加粗**，返回 TextRun 数组
function inlineRuns(text, base = {}) {
  const runs = [];
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  for (const part of parts) {
    if (!part) continue;
    const m = /^\*\*([^*]+)\*\*$/.exec(part);
    runs.push(new TextRun({
      text: m ? m[1] : part,
      bold: m ? true : base.bold,
      font: CN,
      size: base.size ?? 24,
      color: base.color ?? INK,
    }));
  }
  return runs.length ? runs : [new TextRun({ text: '', font: CN, size: base.size ?? 24 })];
}

// 把合同 Markdown 文本转成 docx 段落，做精细排版
function markdownToParagraphs(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (line.trim() === '') {
      out.push(new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: '', font: CN })] }));
      continue;
    }

    let m;
    if ((m = /^#\s+(.*)$/.exec(line))) {
      // 合同标题：居中大字 + 下边框
      out.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 120, after: 240 },
        children: [new TextRun({ text: m[1], bold: true, font: CN, size: 40, color: BRAND })],
      }));
    } else if ((m = /^##\s+(.*)$/.exec(line))) {
      // 条款标题
      out.push(new Paragraph({
        spacing: { before: 220, after: 100 },
        children: [new TextRun({ text: m[1], bold: true, font: CN, size: 28, color: INK })],
      }));
    } else if ((m = /^###\s+(.*)$/.exec(line))) {
      out.push(new Paragraph({
        spacing: { before: 160, after: 80 },
        children: [new TextRun({ text: m[1], bold: true, font: CN, size: 25, color: INK })],
      }));
    } else if ((m = /^>\s?(.*)$/.exec(line))) {
      out.push(new Paragraph({
        spacing: { after: 100, line: 340 },
        indent: { left: 360 },
        border: { left: { style: BorderStyle.SINGLE, size: 18, color: 'C9D6F0', space: 12 } },
        children: inlineRuns(m[1], { color: '4A5A78' }),
      }));
    } else if ((m = /^[-*]\s+(.*)$/.exec(line))) {
      out.push(new Paragraph({
        bullet: { level: 0 },
        spacing: { after: 60, line: 340 },
        children: inlineRuns(m[1]),
      }));
    } else if ((m = /^(\d+)\.\s+(.*)$/.exec(line))) {
      out.push(new Paragraph({
        spacing: { after: 60, line: 340 },
        indent: { left: 240 },
        children: inlineRuns(`${m[1]}. ${m[2]}`),
      }));
    } else {
      out.push(new Paragraph({
        spacing: { after: 100, line: 360 },
        children: inlineRuns(line),
      }));
    }
  }

  return out;
}

// 结尾签字栏
function signatureBlock() {
  const blank = () => new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: '', font: CN })] });
  const row = (left, right) => new Paragraph({
    spacing: { before: 200, after: 60, line: 360 },
    children: [new TextRun({ text: `${left}${' '.repeat(18)}${right}`, font: CN, size: 24, color: INK })],
  });
  return [
    blank(),
    new Paragraph({
      spacing: { before: 240, after: 120 },
      border: { top: { style: BorderStyle.SINGLE, size: 6, color: 'DDE3EE', space: 8 } },
      children: [new TextRun({ text: '签署', bold: true, font: CN, size: 26, color: BRAND })],
    }),
    row('出租方（甲方）签字：__________', '承租方（乙方）签字：__________'),
    row('签订日期：____ 年 __ 月 __ 日', '签订日期：____ 年 __ 月 __ 日'),
  ];
}

router.post('/', async (req, res) => {
  const { content, filename, appendSignature } = req.body || {};

  if (!content || typeof content !== 'string' || !content.trim()) {
    return res.status(400).json({ error: 'content 不能为空' });
  }

  try {
    const children = markdownToParagraphs(content);
    if (appendSignature !== false) children.push(...signatureBlock());

    const doc = new Document({
      sections: [{
        properties: { page: { margin: { top: 1200, bottom: 1200, left: 1400, right: 1400 } } },
        children,
      }],
    });

    const buffer = await Packer.toBuffer(doc);

    const safeName = (filename && String(filename).trim()) || '合同.docx';
    const encoded = encodeURIComponent(safeName.endsWith('.docx') ? safeName : `${safeName}.docx`);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="contract.docx"; filename*=UTF-8''${encoded}`);
    res.send(buffer);
  } catch (err) {
    console.error('[export] error:', err);
    res.status(500).json({ error: err.message || '导出失败' });
  }
});

export default router;
