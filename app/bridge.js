/**
 * 契合 · dc-runtime 桥接层
 * 将 dc-runtime 组件的方法连接到 QiheAPI（Dify 后端）
 * 
 * 工作原理：
 * 1. Monkey-patch DCLogic.prototype 中的关键方法
 * 2. 拦截 _sendHome / _sendChat → 改为调用 QiheAPI.send()
 * 3. 监听 qihe:stream 事件 → 更新组件状态（流式打字 + 合同卡片 + 模板卡片）
 * 4. 拦截 _exportWord → 改用 QiheAPI.downloadContract()
 */

(function () {
  'use strict';

  // ===== 标记检测 =====
  const CONTRACT_RE = /<<<CONTRACT_START>>>([\s\S]*?)<<<CONTRACT_END>>>/;

  function countArticles(text) {
    const m = text.match(/第[一二三四五六七八九十百千零两0-9]+条/g);
    return m ? new Set(m).size : 0;
  }

  // ===== Dify 审查报告 Markdown → 结构化数据 =====
  function parseReviewMarkdown(raw) {
    const result = {
      summary: '',
      risks: [],
    };

    // 提取整体风险总结
    const summaryMatch = raw.match(/##\s*整体风险总结\s*\n([\s\S]*?)(?=\n##\s*风险明细|\n---|\n###|$)/);
    if (summaryMatch) {
      result.summary = summaryMatch[1].trim();
    }

    // 提取每个风险项：### [高风险/中风险/低风险] 标题
    const riskPattern = /###\s*\[(高风险|中风险|低风险)\]\s*(.+?)\n>\s*条款原文[：:]\s*([\s\S]*?)\n\s*风险描述[：:]\s*([\s\S]*?)(?=\n---\s*\n|\n###\s*\[|$)/g;
    let m;
    while ((m = riskPattern.exec(raw)) !== null) {
      const levelMap = { '高风险': 'high', '中风险': 'mid', '低风险': 'low' };
      result.risks.push({
        level: levelMap[m[1]] || 'high',
        heading: m[2].trim(),
        body: m[3].trim(),
        riskText: m[4].trim(),
        // 提取修改建议（如有）
        suggestion: ((m[4] || '').match(/修改建议[：:]\s*(.+?)(?=\n|$)/) || [])[1] || '',
      });
    }

    return result;
  }

  // 去除 body 中的"修改建议"行
  function cleanRiskText(text) {
    return text.replace(/\n*修改建议[：:][\s\S]*$/, '').trim();
  }

  // ===== Monkey-patch DCLogic 原型 =====
  function patchDCLogic() {
    const Proto = window.DCLogic.prototype;
    if (!Proto) return false;

    // 保存原始方法引用
    const _origSendHome = Proto._sendHome;
    const _origSendChat = Proto._sendChat;

    // 当前活跃的组件实例（用于事件回调中更新状态）
    let _activeInstance = null;

    // ======================
    // 拦截 _sendHome()
    // ======================
    Proto._sendHome = function () {
      var self = this;
      _activeInstance = self;
      var t = (self.state.text || '').trim();
      if (!t) return;

      var atts = self.state.attachedFiles || [];
      if (atts.length) {
        // 有附件 → 走审查流程（保持原有行为，Dify 暂不处理文件上传）
        var fileLine = '\uD83D\uDCCE 已上传：' + atts.join('\u3001');
        self.setState({ text: '', attachedFiles: [], chatOpen: true, chatMode: 'review', messages: [{ role: 'user', text: fileLine + '\n' + t }] });
        self._startReview(atts[0]);
        return;
      }

      // 无附件 → 走拟定合同/通用对话
      if (!window.QiheAPI) {
        // fallback 到原始行为
        if (_origSendHome) return _origSendHome.call(self);
        return;
      }

      self._push('user', t);
      self.setState({ text: '', chatOpen: true, chatOpen: true, thinking: true });
      window.QiheAPI.send(t);
    };

    // ======================
    // 拦截 _sendChat()
    // ======================
    Proto._sendChat = function () {
      var self = this;
      _activeInstance = self;
      var t = (self.state.chatText || '').trim();
      if (!t) return;

      if (!window.QiheAPI) {
        if (_origSendChat) return _origSendChat.call(self);
        return;
      }

      self._push('user', t);
      self.setState({ chatText: '', thinking: true });
      window.QiheAPI.send(t);
    };

    // 保存 _exportWord 原始引用（只存一次）
    if (!Proto._exportWordOrig) {
      Proto._exportWordOrig = Proto._exportWord;
    }

    // ======================
    // 拦截 _exportWord()
    // ======================
    Proto._exportWord = function () {
      var self = this;
      if (window.QiheAPI && self._currentContractContent) {
        var name = (self._currentContractName || '房屋租赁合同') + '.docx';
        window.QiheAPI.downloadContract(self._currentContractContent, name);
        self.setState({ savedToast: true });
        clearTimeout(self._saveT);
        self._saveT = setTimeout(function () {
          self.setState({ exportSheetOpen: false, savedToast: false });
        }, 1400);
      } else if (Proto._exportWordOrig && Proto._exportWordOrig !== Proto._exportWord) {
        Proto._exportWordOrig.call(self);
      }
    };

    return true;
  }

  // ======================
  // 监听 qihe:stream 事件
  // ======================
  window.addEventListener('qihe:stream', function (e) {
    var detail = e.detail || {};
    var text = detail.text || '';
    var raw = detail.raw || '';
    var done = detail.done;
    var contract = detail.contract;
    var template = detail.template;

    // 找到活跃的组件实例
    var inst = window._qiheActiveInstance;
    if (!inst) {
      // 尝试从最近一次拦截的实例获取
      inst = window._qiheActiveInstance;
    }
    if (!inst || typeof inst.setState !== 'function') return;

    if (done) {
      // ===== 流式完成 =====
      inst.setState({ thinking: false });

      if (contract) {
        // 有合同 → 插入合同卡片
        // 先更新实例上的 contractText / contractArticles，让现成的 doc card 渲染逻辑直接工作
        inst.contractText = contract.body;
        inst.contractArticles = contract.articles;
        inst._currentContractContent = contract.body;
        inst._currentContractName = contract.name;
        inst.setState(function (s) {
          return {
            messages: s.messages.concat([
              {
                role: 'ai',
                text: '好的，已根据你的需求为你拟定一份《' + contract.name + '》，请查看全文。确认无误后，点击「导出合同」即可保存到本地：',
              },
              { role: 'ai', type: 'doc' },
            ]),
          };
        });
      } else if (template) {
        // 有模板标识符 → 调接口获取
        if (window.QiheAPI) {
          window.QiheAPI.getTemplate(template).then(function (data) {
            // 将模板预览插入为 doc 卡片
            inst.contractText = data.previewHtml || '';
            inst.contractArticles = 0;
            inst._currentContractContent = data.previewHtml || '';
            inst._currentContractName = data.name || template;
            inst._currentTemplateId = template;
            inst.setState(function (s) {
              return {
                messages: s.messages.concat([
                  { role: 'ai', text: '好的，为你调取标准合同模板《' + (data.name || template) + '》：' },
                  { role: 'ai', type: 'doc' },
                ]),
              };
            });
          }).catch(function () {
            inst._push('ai', '模板加载失败，请稍后重试。');
          });
        }
      } else if (text) {
        // 普通文本回复
        inst._push('ai', text);
      }

      inst.setState({ busy: false });
    } else {
      // ===== 流式进行中 =====
      inst.setState({ thinking: false });
      if (inst.state && inst.state.messages) {
        var msgs = inst.state.messages;
        var lastIdx = msgs.length - 1;
        if (lastIdx >= 0 && msgs[lastIdx].role === 'ai' && !msgs[lastIdx].type) {
          // 更新最后一条 AI 消息
          inst.setState(function (s) {
            var m = s.messages.slice();
            m[m.length - 1] = Object.assign({}, m[m.length - 1], { text: text });
            return { messages: m };
          });
        } else {
          // 插入新的 AI 消息
          inst._push('ai', text);
        }
      } else {
        inst._push('ai', text);
      }
    }
  });

  // ======================
  // 监听错误
  // ======================
  window.addEventListener('qihe:error', function (e) {
    var inst = window._qiheActiveInstance;
    if (!inst) return;
    inst.setState({ thinking: false, busy: false });
    inst._push('ai', '抱歉，出错了：' + (e.detail.message || '请稍后重试') + '。请检查后端服务是否已启动。');
  });

  // ======================
  // 启动补丁
  // ======================
  function waitAndPatch(retries) {
    retries = retries || 0;
    if (retries > 60) {
      console.warn('[qihe-bridge] DCLogic not found after 60 retries, giving up');
      return;
    }
    if (window.DCLogic && window.DCLogic.prototype) {
      var ok = patchDCLogic();
      if (ok) {
        console.log('[qihe-bridge] DCLogic.prototype patched successfully');

        // 劫持所有未来的组件实例
        var origRenderVals = window.DCLogic.prototype.renderVals;
        if (origRenderVals) {
          window.DCLogic.prototype.renderVals = function () {
            window._qiheActiveInstance = this;
            return origRenderVals.call(this);
          };
        }
      }
      return;
    }
    setTimeout(function () { waitAndPatch(retries + 1); }, 200);
  }

  waitAndPatch();
})();
