import config from '../config.js';

const encoder = new TextEncoder();

function sse(obj) {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

function randomId(prefix = 'mock') {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 把一段文本按 Dify 的 message 事件切成小块，模拟流式打字机
async function* emitAnswer(text, conversationId, { chunk = 6, delay = 18 } = {}) {
  const messageId = randomId('msg');
  for (let i = 0; i < text.length; i += chunk) {
    const piece = text.slice(i, i + chunk);
    yield sse({
      event: 'message',
      conversation_id: conversationId,
      message_id: messageId,
      answer: piece,
    });
    if (delay) await sleep(delay);
  }
  yield sse({ event: 'message_end', conversation_id: conversationId, message_id: messageId });
}

// 根据用户输入决定 mock 走哪种场景，方便本地验证四类结果
function mockAnswerFor(query) {
  const q = (query || '').trim();

  if (/模板/.test(q)) {
    // 合同模板分支：只吐轻量标识符，前端据此调模板接口
    return '好的，为你调取标准合同模板：\n\n<<<TEMPLATE:housing_lease>>>';
  }

  // 简单判断信息是否“基本齐全”：包含常见关键字则视为可出终稿
  const looksComplete = /(甲方|乙方|出租|承租).*(租金|押金|期限|地址)/s.test(q) || q.length > 40;
  if (looksComplete) {
    const contract = [
      '# 房屋租赁合同',
      '',
      '**出租方（甲方）：** ____（示例：张三）',
      '**承租方（乙方）：** ____（示例：李四）',
      '',
      '根据《中华人民共和国民法典》及相关法律法规，甲乙双方在平等、自愿、协商一致的基础上，就房屋租赁事宜达成如下协议：',
      '',
      '## 第一条 房屋基本情况',
      '甲方将坐落于 ____ 的房屋出租给乙方使用，建筑面积约 ____ 平方米，户型 ____。',
      '',
      '## 第二条 租赁期限',
      '租赁期自 ____ 年 __ 月 __ 日起至 ____ 年 __ 月 __ 日止。',
      '',
      '## 第三条 租金及支付方式',
      '月租金为人民币 ____ 元，押金 ____ 元，按 ____ 支付。',
      '',
      '## 第四条 水电气及物业费',
      '租赁期间产生的水、电、燃气及物业费由 ____ 承担。',
      '',
      '## 第五条 违约责任',
      '任何一方违反本合同约定，应向对方支付违约金并赔偿由此造成的损失。',
      '',
      '本合同一式两份，甲乙双方各执一份，自双方签字之日起生效。',
    ].join('\n');

    return `已根据你提供的信息生成完整的房屋租赁合同，请查看：\n\n<<<CONTRACT_START>>>\n${contract}\n<<<CONTRACT_END>>>`;
  }

  // 信息不全：多轮追问
  return [
    '好的，我来帮你拟定房屋租赁合同。请补充以下信息：',
    '',
    '1. **出租方**：姓名、身份证号、联系电话',
    '2. **承租方**：姓名、身份证号、联系电话',
    '3. **房屋**：详细地址、面积、户型',
    '4. **租期**：起止日期',
    '5. **租金**：月租金、押金、支付方式',
    '',
    '你可以一次性发给我，也可以分几条发送。',
  ].join('\n');
}

// mock 模式：返回一个可被 res 消费的异步可迭代对象（yield 字符串块）
async function* mockChatStream({ query, conversationId }) {
  const cid = conversationId || randomId('conv');
  const answer = mockAnswerFor(query);
  yield* emitAnswer(answer, cid);
}

// 真实模式：请求 Dify /chat-messages（streaming），把原始 SSE 字节流转成字符串块转发
async function* realChatStream({ query, conversationId, user }) {
  const url = `${config.difyBaseUrl}/chat-messages`;
  const body = {
    inputs: {},
    query,
    response_mode: 'streaming',
    conversation_id: conversationId || '',
    user,
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.difyApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok || !resp.body) {
    const detail = await resp.text().catch(() => '');
    throw new Error(`Dify 请求失败 (${resp.status}): ${detail.slice(0, 500)}`);
  }

  const decoder = new TextDecoder();
  for await (const chunk of resp.body) {
    yield decoder.decode(chunk, { stream: true });
  }
}

export function createChatStream(params) {
  return config.mock ? mockChatStream(params) : realChatStream(params);
}

export { encoder };
