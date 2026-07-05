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
  const FALLBACK_API = 'http://localhost:3002';
  const DIRECT_DIFY_BASE = 'https://api.dify.ai/v1';
  const DIRECT_DIFY_API_KEY = 'app-PSvdjW5cksiz7CMjX0bfZdIJ';
  // 默认优先同源（用于封装后端同端口托管）；若当前 3000 不是后端，会在运行时探活并自动回退。
  let API_BASE = location.protocol === 'file:' ? REMOTE_API : '';
  let _apiProbe = null;

  async function ensureApiBase() {
    if (_apiProbe) return _apiProbe;
    _apiProbe = (async () => {
      const candidates = [];
      if (location.protocol !== 'file:') candidates.push(''); // 当前 origin
      candidates.push(REMOTE_API);
      if (FALLBACK_API !== REMOTE_API) candidates.push(FALLBACK_API);
      for (const base of candidates) {
        try {
          const resp = await fetch(base + '/api/health', { method: 'GET' });
          if (!resp.ok) continue;
          let data = null;
          try {
            data = await resp.json();
          } catch (_) {
            data = null;
          }
          // 必须是后端健康 JSON，避免被 3000 静态预览服务器的“200 HTML 页面”误判。
          if (data && data.ok === true) {
            API_BASE = base;
            return API_BASE;
          }
        } catch (_) {}
      }
      API_BASE = null;
      return API_BASE;
    })();
    return _apiProbe;
  }

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
  const CONTRACT_RE = /<<<\s*CONTRACT_START\s*>>>([\s\S]*?)<<<\s*CONTRACT_END\s*>>>/i;
  const TEMPLATE_RE = /<<<\s*TEMPLATE\s*[：:]\s*([^>\r\n]+?)\s*>>>/i;
  const TEMPLATE_RE_GLOBAL = /<<<\s*TEMPLATE\s*[：:]\s*([^>\r\n]+?)\s*>>>/gi;

  function normalizeMarkers(text) {
    return String(text || '')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/<<<\s*CONTRACT_START\s*>>>/gi, '<<<CONTRACT_START>>>')
      .replace(/<<<\s*CONTRACT_END\s*>>>/gi, '<<<CONTRACT_END>>>')
      .replace(/<<<\s*TEMPLATE\s*[：:]\s*([^>\r\n]+?)\s*>>>/gi, '<<<TEMPLATE:$1>>>');
  }

  function normalizeTemplateId(id) {
    const raw = String(id || '').trim().replace(/^['"`]+|['"`]+$/g, '');
    const lowered = raw.toLowerCase();
    if (!raw) return '';
    if (lowered === 'housing_lease' || lowered === 'housing-lease' || lowered === 'housinglease') return 'housing_lease';
    if (raw === '房屋租赁合同' || raw === '租赁合同') return 'housing_lease';
    return lowered.replace(/\s+/g, '_').replace(/[^a-z0-9_-]/g, '');
  }

  function liveDisplay(raw) {
    const normalized = normalizeMarkers(raw);
    let t = normalized.replace(TEMPLATE_RE_GLOBAL, '');
    const startIdx = t.search(/<<<\s*CONTRACT_START\s*>>>/i);
    if (startIdx !== -1) t = t.slice(0, startIdx);
    t = t.replace(/<<<\s*[A-Z_:a-z0-9-]*\s*$/, '').replace(/<+$/, '');
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
      const base = await ensureApiBase();
      if (base === null) throw new Error('后端服务未连接');
      const resp = await fetch(base + '/api/export-docx', {
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

  // 优先走后端下载；后端不可用时回退到随包静态 docx（保证封装后/无后端也能下载）。
  async function downloadTemplate(id, btn) {
    try {
      if (btn) btn.disabled = true;
      const normalizedId = normalizeTemplateId(id) || id;
      const base = await ensureApiBase();
      const a = document.createElement('a');
      if (base !== null) {
        a.href = base + '/api/templates/' + encodeURIComponent(normalizedId) + '/download';
      } else {
        a.href = 'templates/' + encodeURIComponent(normalizedId) + '.docx';
      }
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

  const DIFY_TEMP_FAILURE_RE = /系统暂时无法处理您的请求|请稍后重试或重新描述您的问题/;

  async function streamFromReader(reader, onEvent) {
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
        onEvent(evt);
      }
    }
  }

  async function sendDirectToDify(query, files) {
    const resp = await fetch(DIRECT_DIFY_BASE + '/chat-messages', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + DIRECT_DIFY_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: {},
        query,
        response_mode: 'streaming',
        conversation_id: state.conversationId || '',
        user: state.userId || 'anonymous',
        files: files && files.length ? files : undefined,
      }),
    });
    if (!resp.ok || !resp.body) {
      throw new Error('Dify 直连失败 (' + resp.status + ')');
    }
    let raw = '';
    await streamFromReader(resp.body.getReader(), (evt) => {
      if (evt.conversation_id) state.conversationId = evt.conversation_id;
      if (evt.event === 'error') throw new Error(evt.message || '生成出错');
      if (typeof evt.answer === 'string') {
        raw += evt.answer;
        const live = liveDisplay(raw);
        if (!live.trim()) return;
        window.dispatchEvent(
          new CustomEvent('qihe:stream', {
            detail: { text: live, raw, done: false },
          })
        );
      }
    });
    return raw;
  }

  // 判断 Dify 文件类型：图片走 image，其余（Word/PDF/文本等）走 document。
  function difyFileType(file) {
    const name = ((file && file.name) || '').toLowerCase();
    const mime = ((file && file.type) || '').toLowerCase();
    if (mime.indexOf('image/') === 0 || /\.(jpg|jpeg|png|gif|webp|svg)$/.test(name)) return 'image';
    return 'document';
  }

  // 上传文件到 Dify，返回 upload_file_id（供 chat-messages 的 files 引用）。
  async function uploadFileToDify(file) {
    const fd = new FormData();
    fd.append('file', file, file.name || 'upload');
    fd.append('user', state.userId || 'anonymous');
    const resp = await fetch(DIRECT_DIFY_BASE + '/files/upload', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + DIRECT_DIFY_API_KEY },
      body: fd,
    });
    if (!resp.ok) {
      const t = await resp.text().catch(() => '');
      throw new Error('文件上传失败 (' + resp.status + '): ' + t.slice(0, 200));
    }
    const data = await resp.json();
    if (!data || !data.id) throw new Error('文件上传失败：无返回 id');
    return data.id;
  }

  // 流式结束后的统一收尾：解析合同/模板/审查标记并派发 done 事件。
  function dispatchStreamDone(raw, query) {
    const markerRaw = normalizeMarkers(raw);
    const contract = markerRaw.match(CONTRACT_RE);
    let tpl = markerRaw.match(TEMPLATE_RE);
    let templateId = tpl ? normalizeTemplateId(tpl[1]) : '';
    if (!raw && /模板/.test(query || '')) templateId = 'housing_lease';
    const intro = markerRaw.replace(CONTRACT_RE, '').replace(TEMPLATE_RE_GLOBAL, '').trim();
    const finalText = intro || (contract ? '好的，已根据你的需求为你拟定合同，请查看全文。' : raw);
    window.dispatchEvent(
      new CustomEvent('qihe:stream', {
        detail: {
          text: finalText,
          raw,
          done: true,
          contract: contract
            ? { body: contract[1].trim(), name: (contract[1].trim().match(/^#\s+(.+)$/m) || ['', '合同'])[1].trim(), articles: countArticles(contract[1].trim()) }
            : null,
          template: templateId || null,
        },
      })
    );
    return finalText;
  }

  // 带文件的审查：上传文件到 Dify，作为 sys.files 附加到对话中，走文档抽取/视觉识别。
  async function reviewWithFile(file, query, retried) {
    if (state.busy && !retried) return;
    state.busy = true;
    let raw = '';
    try {
      const uploadId = await uploadFileToDify(file);
      const files = [{ type: difyFileType(file), transfer_method: 'local_file', upload_file_id: uploadId }];
      const q = query || '请审查我上传的这份合同文件，识别其中的风险条款，按规则输出整体风险总结与逐条风险明细。';
      raw = await sendDirectToDify(q, files);
      const finalText = dispatchStreamDone(raw, q);
      if (DIFY_TEMP_FAILURE_RE.test(finalText) && !retried) {
        state.conversationId = '';
        persist();
        return reviewWithFile(file, query, true);
      }
      state.messages.push({ role: 'ai', content: raw });
      persist();
    } catch (err) {
      window.dispatchEvent(new CustomEvent('qihe:error', { detail: { message: err.message || '请稍后重试' } }));
    } finally {
      state.busy = false;
    }
  }

  // ===== SSE 流式对话 =====
  async function sendChatMessage(query, retryCount = 0, bypassBusy = false) {
    if (!query || (state.busy && !bypassBusy)) return;
    if (!bypassBusy) state.busy = true;
    let raw = '';

    try {
      const base = await ensureApiBase();
      if (base !== null) {
        const resp = await fetch(base + '/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query,
            conversationId: state.conversationId,
            user: state.userId,
          }),
        });
        if (!resp.ok || !resp.body) throw new Error('请求失败 (' + resp.status + ')');
        await streamFromReader(resp.body.getReader(), (evt) => {
          if (evt.conversation_id) state.conversationId = evt.conversation_id;
          if (evt.event === 'error') throw new Error(evt.message || '生成出错');
          if (typeof evt.answer === 'string') {
            raw += evt.answer;
            const live = liveDisplay(raw);
            if (!live.trim()) return;
            window.dispatchEvent(
              new CustomEvent('qihe:stream', {
                detail: { text: live, raw, done: false },
              })
            );
          }
        });
      } else {
        raw = await sendDirectToDify(query);
      }

      // 流式完成
      var markerRaw = normalizeMarkers(raw);
      var contract = markerRaw.match(CONTRACT_RE);
      var tpl = markerRaw.match(TEMPLATE_RE);
      var templateId = tpl ? normalizeTemplateId(tpl[1]) : '';

      // 代码执行节点缩进报错兜底：Dify 无输出但用户在请求模板
      if (!raw && /模板/.test(query)) {
        tpl = ['<<<TEMPLATE:housing_lease>>>', 'housing_lease'];
        templateId = 'housing_lease';
      }
      var intro = markerRaw
        .replace(CONTRACT_RE, '')
        .replace(TEMPLATE_RE_GLOBAL, '')
        .trim();

      const finalText = intro || (contract ? '好的，已根据你的需求为你拟定合同，请查看全文。' : raw);
      // Dify 工作流偶发落入兜底失败文案时，自动重试一次并重置会话，避免用户被卡死在错误分支。
      if (DIFY_TEMP_FAILURE_RE.test(finalText) && retryCount < 1) {
        state.conversationId = '';
        persist();
        return sendChatMessage(query, retryCount + 1, true);
      }

      window.dispatchEvent(
        new CustomEvent('qihe:stream', {
          detail: {
            text: finalText,
            raw,
            done: true,
            contract: contract
              ? { body: contract[1].trim(), name: (contract[1].trim().match(/^#\s+(.+)$/m) || ['', '合同'])[1].trim(), articles: countArticles(contract[1].trim()) }
              : null,
            template: templateId || null,
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
      if (!bypassBusy) state.busy = false;
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
    reviewWithFile(file, query) {
      if (!state.userId) this.init();
      return reviewWithFile(file, query);
    },
    downloadContract(content, filename, btn) {
      return downloadGeneratedContract(content, filename, btn);
    },
    downloadTemplate(id, btn) {
      return downloadTemplate(id, btn);
    },
    async getTemplate(id) {
      const normalizedId = normalizeTemplateId(id) || id;
      const base = await ensureApiBase();
      // 后端可用则走后端实时转换；否则回退随包静态模板 JSON（封装后/无后端也能加载）。
      if (base !== null) {
        try {
          const resp = await fetch(base + '/api/templates/' + encodeURIComponent(normalizedId));
          if (resp.ok) return await resp.json();
        } catch (_) {}
      }
      try {
        const resp = await fetch('templates/' + encodeURIComponent(normalizedId) + '.json');
        if (resp.ok) return await resp.json();
      } catch (_) {}
      throw new Error('模板加载失败');
    },
    renderMarkdown,
    escapeHtml,
  };

  console.log('[QiheAPI] 桥接层已就绪，后端地址:', API_BASE || '(相对路径)');
})();
