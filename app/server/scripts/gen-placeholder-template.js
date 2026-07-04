// 生成占位用的「房屋租赁合同模板.docx」。
// 用法：node scripts/gen-placeholder-template.js
// 你们的正式定稿 Word 出来后，直接覆盖 templates/housing_lease/template.docx 即可，无需再跑本脚本。
import {
  Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle,
} from 'docx';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '../templates/housing_lease');
const outFile = path.join(outDir, 'template.docx');

const CN = 'PingFang SC';
const INK = '1A2233';
const BRAND = '3A67DC';

const title = (t) => new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 120 },
  children: [new TextRun({ text: t, bold: true, font: CN, size: 40, color: BRAND })],
});
const note = (t) => new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 240 },
  children: [new TextRun({ text: t, font: CN, size: 20, color: '99A3B5' })],
});
const h = (t) => new Paragraph({
  spacing: { before: 200, after: 100 },
  children: [new TextRun({ text: t, bold: true, font: CN, size: 26, color: INK })],
});
const p = (t) => new Paragraph({
  spacing: { after: 100, line: 360 },
  children: [new TextRun({ text: t, font: CN, size: 24, color: INK })],
});

const children = [
  title('房屋租赁合同'),
  note('（占位模板 · 待替换为正式定稿文件）'),
  p('出租方（甲方）：____________________'),
  p('承租方（乙方）：____________________'),
  p('根据《中华人民共和国民法典》及相关法律法规，甲乙双方在平等、自愿、协商一致的基础上，就房屋租赁事宜达成如下协议：'),
  h('第一条 房屋基本情况'),
  p('甲方将坐落于 ____________________ 的房屋出租给乙方使用，建筑面积约 ______ 平方米，户型 __________。'),
  h('第二条 租赁期限'),
  p('租赁期自 ______ 年 __ 月 __ 日起至 ______ 年 __ 月 __ 日止。'),
  h('第三条 租金及支付方式'),
  p('月租金为人民币 ______ 元（大写：____________________），押金 ______ 元，支付方式为 __________。'),
  h('第四条 水电气及物业费'),
  p('租赁期间产生的水、电、燃气及物业等费用由 __________ 承担。'),
  h('第五条 双方权利与义务'),
  p('甲乙双方应按照本合同约定履行各自义务，保障对方合法权益。'),
  h('第六条 违约责任'),
  p('任何一方违反本合同约定，应向对方支付违约金并赔偿由此造成的损失。'),
  new Paragraph({
    spacing: { before: 260, after: 100 },
    border: { top: { style: BorderStyle.SINGLE, size: 6, color: 'DDE3EE', space: 8 } },
    children: [new TextRun({ text: '签署', bold: true, font: CN, size: 26, color: BRAND })],
  }),
  p('出租方（甲方）签字：__________          承租方（乙方）签字：__________'),
  p('签订日期：____ 年 __ 月 __ 日            签订日期：____ 年 __ 月 __ 日'),
];

const doc = new Document({
  sections: [{
    properties: { page: { margin: { top: 1200, bottom: 1200, left: 1400, right: 1400 } } },
    children,
  }],
});

const buffer = await Packer.toBuffer(doc);
mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, buffer);
console.log('占位模板已生成:', outFile);
