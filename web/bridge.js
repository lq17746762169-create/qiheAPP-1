/**
 * 契合 · dc-runtime 桥接层 v2
 * 
 * v1 问题：只 patch 了 DCLogic.prototype，但 Component 类定义了同名实例方法覆盖了它
 * v2 方案：hook renderVals → 每次 render 拿到实例 → 直接替换实例上的 _sendHome/_sendChat
 */

(function () {
  'use strict';

  function countArticles(text) {
    var m = text.match(/第[一二三四五六七八九十百千零两0-9]+条/g);
    return m ? new Set(m).size : 0;
  }

  var _hooked = new WeakSet();

  function hookInstance(inst) {
    if (_hooked.has(inst)) return;
    _hooked.add(inst);
    window._qiheActiveInstance = inst;

    var origSendHome = inst._sendHome;
    var origSendChat = inst._sendChat;
    var origExportWord = inst._exportWord;

    // 替换 _sendHome → 改走 QiheAPI
    inst._sendHome = function () {
      var t = (this.state.text || '').trim();
      if (!t) return;
      if ((this.state.attachedFiles || []).length) return origSendHome.call(this);
      if (!window.QiheAPI) return origSendHome.call(this);

      this._push('user', t);
      this.setState({ text: '', chatOpen: true, thinking: true });
      window.QiheAPI.send(t);
    };

    // 替换 _sendChat → 改走 QiheAPI
    inst._sendChat = function () {
      var t = (this.state.chatText || '').trim();
      if (!t) return;
      if (!window.QiheAPI) return origSendChat.call(this);

      this._push('user', t);
      this.setState({ chatText: '', thinking: true });
      window.QiheAPI.send(t);
    };

    // 替换 _exportWord → 改走后端 docx 接口
    inst._exportWord = function () {
      if (window.QiheAPI && this._currentContractContent) {
        var name = (this._currentContractName || '房屋租赁合同') + '.docx';
        window.QiheAPI.downloadContract(this._currentContractContent, name);
        this.setState({ savedToast: true });
      } else {
        origExportWord.call(this);
      }
    };

    console.log('[qihe-bridge] Instance hooked');
  }

  // ===== 监听 Dify 流式事件 =====
  var _streamingText = '';

  window.addEventListener('qihe:stream', function (e) {
    var d = e.detail || {};
    var inst = window._qiheActiveInstance;
    if (!inst || typeof inst.setState !== 'function') return;

    if (d.done) {
      inst.setState({ thinking: false });
      if (d.contract) {
        inst.contractText = d.contract.body;
        inst.contractArticles = d.contract.articles;
        inst._currentContractContent = d.contract.body;
        inst._currentContractName = d.contract.name;
        inst.setState(function (s) {
          return { messages: s.messages.concat([
            { role: 'ai', text: '好的，已根据你的需求为你拟定一份《' + d.contract.name + '》，请查看全文。确认无误后，点击「导出合同」即可保存到本地：' },
            { role: 'ai', type: 'doc' },
          ])};
        });
      } else if (d.template) {
        if (window.QiheAPI) {
          window.QiheAPI.getTemplate(d.template).then(function (data) {
            inst.contractText = data.previewHtml || '';
            inst._currentContractName = data.name || d.template;
            inst.setState(function (s) {
              return { messages: s.messages.concat([
                { role: 'ai', text: '好的，为你调取标准合同模板《' + (data.name || d.template) + '》：' },
                { role: 'ai', type: 'doc' },
              ])};
            });
          }).catch(function () { inst._push('ai', '模板加载失败'); });
        }
      } else if (d.text) {
        // 纯文本回复：不清空重来，流式阶段已经逐字更新了最后一条消息
        // 无需重复 push，只需确保 thinking 已关
      }
    } else {
      // 流式中 → 更新最后一条 AI 消息
      inst.setState({ thinking: false });
      var msgs = inst.state.messages || [];
      var last = msgs.length - 1;
      if (last >= 0 && msgs[last].role === 'ai' && !msgs[last].type) {
        inst.setState(function (s) {
          var m = s.messages.slice();
          m[m.length - 1] = Object.assign({}, m[m.length - 1], { text: d.text });
          return { messages: m };
        });
      } else {
        inst._push('ai', d.text);
      }
    }
  });

  window.addEventListener('qihe:error', function (e) {
    var inst = window._qiheActiveInstance;
    if (inst) {
      inst.setState({ thinking: false, busy: false });
      inst._push('ai', '抱歉，出错了：' + (e.detail.message || '请稍后重试'));
    }
  });

  // ===== Hook DCLogic.prototype.setState 来捕获实例 =====
  function waitForDCLogic(n) {
    n = n || 0;
    if (n > 100) return;
    if (window.DCLogic && window.DCLogic.prototype && window.DCLogic.prototype.setState) {
      var origSetState = window.DCLogic.prototype.setState;
      window.DCLogic.prototype.setState = function () {
        hookInstance(this);
        return origSetState.apply(this, arguments);
      };
      console.log('[qihe-bridge] setState hooked');
      return;
    }
    setTimeout(function () { waitForDCLogic(n + 1); }, 150);
  }

  waitForDCLogic();
})();
