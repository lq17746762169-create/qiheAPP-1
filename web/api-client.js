/**
 * 契合 · API 桥接层
 * 连接前端 UI（dc-runtime 渲染）与后端 Express API
 * 
 * 后端 API：
 *   POST /api/chat          → SSE 流式对话
 *   POST /api/export-docx   → 合同导出 Word
 *   GET  /api/templates/:id  → 模板预览
 *   GET  /api/templates/:id/download → 模板下载
 */

(function () {
  'use strict';

  // ===== 配置 =====
  const REMOTE_API = 'http://localhost:3000';
  const API_BASE = location.protocol === 'file:' ? REMOTE_API : '';

  const LS = {
    user: 'qihe_user_id',
    conv: 'qihe_conversation_id',
    history: 'qihe_history',
  };

  // ===== 会话状态 =====
  const state = {
    userId: '',
    conversationId: '',
    messages: [],
    busy: false,
  };

  function uid(prefix) {
    return prefix + '-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  function getUserId() {
    let id = localStorage.getItem(LS.user);
    if (!id) {
      id = uid('u');
      localStorage.setItem(LS.user, id);
    }
    return id;
  }

  function persist() {
    localStorage.setItem(LS.conv, state.conversationId || '');
    localStorage.setItem(LS.history, JSON.stringify(state.messages));
  }

  function clearConversation() {
    state.conversationId = '';
    state.messages = [];
    localStorage.removeItem(LS.conv);
    localStorage.removeItem(LS.history);
  }

  // ===== 工具函数 =====
  function escapeHtml(s) {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function inlineMd(s) {
    return s
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  }

  function renderMarkdown(text) {
    const lines = escapeHtml(text).replace(/\r\n/g, '\n').split('\n');
    let html = '';
    let list = null;
    const closeList = () => {
      if (list) {
        html += `</${list}>`;
        list = null;
      }
    };
    for (const raw of lines) {
      const line = raw.replace(/\s+$/, '');
      let m;
      if (line.trim() === '') {
        closeList();
        continue;
      }
      if ((m = /^###\s+(.*)$/.exec(line))) {
        closeList();
        html += `<h3>${inlineMd(m[1])}</h3>`;
      } else if ((m = /^##\s+(.*)$/.exec(line))) {
        closeList();
        html += `<h2>${inlineMd(m[1])}</h2>`;
      } else if ((m = /^#\s+(.*)$/.exec(line))) {
        closeList();
        html += `<h1>${inlineMd(m[1])}</h1>`;
      } else if ((m = /^&gt;\s?(.*)$/.exec(line))) {
        closeList();
        html += `<blockquote>${inlineMd(m[1])}</blockquote>`;
      } else if ((m = /^[-*]\s+(.*)$/.exec(line))) {
        if (list !== 'ul') {
          closeList();
          html += '<ul>';
          list = 'ul';
        }
        html += `<li>${inlineMd(m[1])}</li>`;
      } else if ((m = /^\d+\.\s+(.*)$/.exec(line))) {
        if (list !== 'ol') {
          closeList();
          html += '<ol>';
          list = 'ol';
        }
        html += `<li>${inlineMd(m[1])}</li>`;
      } else {
        closeList();
        html += `<p>${inlineMd(line)}</p>`;
      }
    }
    closeList();
    return html;
  }

  // ===== 标记检测 =====
  const CONTRACT_RE = /<<<CONTRACT_START>>>([\s\S]*?)<<<CONTRACT_END>>>/;
  const TEMPLATE_RE = /<<<TEMPLATE:([a-zA-Z0-9_-]+)>>>/;

  function liveDisplay(raw) {
    let t = raw.replace(/<<<TEMPLATE:[a-zA-Z0-9_-]+>>>/g, '');
    const startIdx = t.indexOf('<<<CONTRACT_START>>>');
    if (startIdx !== -1) t = t.slice(0, startIdx);
    t = t.replace(/<<<[A-Z_:a-z0-9-]*$/, '').replace(/<+$/, '');
    return t;
  }

  function countArticles(text) {
    const m = text.match(/第[一二三四五六七八九十百千零两0-9]+条/g);
    if (!m) return 0;
    return new Set(m).size;
  }

  // ===== 下载工具 =====
  function triggerBlobDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  async function downloadGeneratedContract(content, filename, btn) {
    try {
      if (btn) btn.disabled = true;
      const resp = await fetch(API_BASE + '/api/export-docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, filename }),
      });
      if (!resp.ok) throw new Error('导出失败');
      triggerBlobDownload(await resp.blob(), filename);
    } catch (e) {
      alert('导出失败，请稍后重试');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function downloadTemplate(id, btn) {
    try {
      if (btn) btn.disabled = true;
      const a = document.createElement('a');
      a.href = API_BASE + '/api/templates/' + encodeURIComponent(id) + '/download';
      a.download = '';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      alert('下载失败，请稍后重试');
    } finally {
      setTimeout(() => {
        if (btn) btn.disabled = false;
      }, 1200);
    }
  }

  // ===== SSE 流式对话 =====
  async function sendChatMessage(query) {
    if (!query || state.busy) return;
    state.busy = true;
    let raw = '';

    try {
      const resp = await fetch(API_BASE + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          conversationId: state.conversationId,
          user: state.userId,
        }),
      });

      if (!resp.ok || !resp.body) throw new Error('请求失败 (' + resp.status + ')');

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          const s = line.trim();
          if (!s.startsWith('data:')) continue;
          const payload = s.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          let evt;
          try {
            evt = JSON.parse(payload);
          } catch {
            continue;
          }
          if (evt.conversation_id) state.conversationId = evt.conversation_id;
          if (evt.event === 'error') throw new Error(evt.message || '生成出错');
          if (typeof evt.answer === 'string') {
            raw += evt.answer;
            // 触发自定义事件，由 UI 层监听
            window.dispatchEvent(
              new CustomEvent('qihe:stream', {
                detail: { text: liveDisplay(raw), raw, done: false },
              })
            );
          }
        }
      }

      // 流式完成
      const contract = raw.match(CONTRACT_RE);
      const tpl = raw.match(TEMPLATE_RE);
      const intro = raw
        .replace(CONTRACT_RE, '')
        .replace(/<<<TEMPLATE:[a-zA-Z0-9_-]+>>>/g, '')
        .trim();

      window.dispatchEvent(
        new CustomEvent('qihe:stream', {
          detail: {
            text: intro || (contract ? '好的，已根据你的需求为你拟定合同，请查看全文。' : raw),
            raw,
            done: true,
            contract: contract
              ? { body: contract[1].trim(), name: (contract[1].trim().match(/^#\s+(.+)$/m) || ['', '合同'])[1].trim(), articles: countArticles(contract[1].trim()) }
              : null,
            template: tpl ? tpl[1] : null,
          },
        })
      );

      state.messages.push({ role: 'ai', content: raw });
      persist();
    } catch (err) {
      window.dispatchEvent(
        new CustomEvent('qihe:error', {
          detail: { message: err.message || '请稍后重试' },
        })
      );
      state.messages.push({ role: 'ai', content: 'error: ' + (err.message || '') });
      persist();
    } finally {
      state.busy = false;
    }
  }

  // ===== 暴露 API =====
  window.QiheAPI = {
    get state() {
      return state;
    },
    init() {
      state.userId = getUserId();
      state.conversationId = localStorage.getItem(LS.conv) || '';
      try {
        state.messages = JSON.parse(localStorage.getItem(LS.history) || '[]');
      } catch {
        state.messages = [];
      }
    },
    send(query) {
      if (!state.userId) this.init();
      state.messages.push({ role: 'user', content: query });
      persist();
      return sendChatMessage(query);
    },
    clearHistory() {
      clearConversation();
    },
    downloadContract(content, filename, btn) {
      return downloadGeneratedContract(content, filename, btn);
    },
    downloadTemplate(id, btn) {
      return downloadTemplate(id, btn);
    },
    async getTemplate(id) {
      const resp = await fetch(API_BASE + '/api/templates/' + encodeURIComponent(id));
      if (!resp.ok) throw new Error('模板加载失败');
      return resp.json();
    },
    renderMarkdown,
    escapeHtml,
  };

  console.log('[QiheAPI] 桥接层已就绪，后端地址:', API_BASE || '(相对路径)');
})();
