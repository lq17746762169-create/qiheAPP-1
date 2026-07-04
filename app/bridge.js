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

    // 替换 _startReview → 用真实 Dify 替代假数据
    var origStartReview = inst._startReview;
    inst._startReview = function (name) {
      if (!window.QiheAPI) return origStartReview.call(this, name);
      var self = this;
      self.setState({ reviewLoading: true, loadingStep: '正在解析文件结构…' });
      // 发真实请求到 Dify
      window.QiheAPI.send('请审查以下文件：' + (name || '合同文件'));
    };

    // 修复返回逻辑：从风险详情退回时应回到聊天页而非首页
    if (!inst.__qiheBackFixed) {
      inst.__qiheBackFixed = true;
      var origBackHome = inst.backHome;
      inst.backHome = function () {
        if (this.state.chatOpen && this.state.review === 'detail') {
          this.setState({ review: null });
        } else if (origBackHome) {
          origBackHome.call(this);
        } else {
          this.setState({ review: null });
        }
      };
    }

    // 修复审查页面颜色：包裹 renderVals，修改 clauses 颜色
    if (inst.renderVals && !inst.__qiheColorFixed) {
      inst.__qiheColorFixed = true;
      var _origRV = inst.renderVals;
      inst.renderVals = function () {
        var v = _origRV.call(this);
        if (v && v.clauses && this.clauseData) {
          v.clauses = v.clauses.map(function (c, i) {
            var level = this.clauseData[i] ? this.clauseData[i].level : null;
            if (level === 'high') {
              c.riskLabel = '高风险';
              c.tagStyle = 'font-size:12px;font-weight:700;color:#fff;background:#dc2626;padding:3px 9px;border-radius:7px;';
              c.bodyStyle = 'font-size:14.5px;line-height:1.75;color:#3a4763;background:#fef2f2;border-left:3px solid #dc2626;padding:9px 12px;border-radius:0 10px 10px 0;';
              c.bubbleWrapStyle = 'position:relative;margin-top:11px;margin-left:10px;background:#fff;border:1px solid #fecaca;border-radius:4px 14px 14px 14px;padding:12px 14px;box-shadow:0 6px 18px rgba(220,38,38,0.08);';
              c.pointerStyle = 'position:absolute;top:-7px;left:16px;width:12px;height:12px;background:#fff;border-left:1px solid #fecaca;border-top:1px solid #fecaca;transform:rotate(45deg);';
            } else if (level === 'low') {
              c.riskLabel = '低风险';
              c.tagStyle = 'font-size:12px;font-weight:700;color:#fff;background:#d97706;padding:3px 9px;border-radius:7px;';
              c.bodyStyle = 'font-size:14.5px;line-height:1.75;color:#3a4763;background:#fffbeb;border-left:3px solid #d97706;padding:9px 12px;border-radius:0 10px 10px 0;';
              c.bubbleWrapStyle = 'position:relative;margin-top:11px;margin-left:10px;background:#fff;border:1px solid #fde68a;border-radius:4px 14px 14px 14px;padding:12px 14px;box-shadow:0 6px 18px rgba(217,119,6,0.08);';
              c.pointerStyle = 'position:absolute;top:-7px;left:16px;width:12px;height:12px;background:#fff;border-left:1px solid #fde68a;border-top:1px solid #fde68a;transform:rotate(45deg);';
            }
            return c;
          }, this);
        }
        // 修正风险 Tab 视图颜色（risks 数组）
        if (v && v.risks && this.reviewDocs) {
          var doc = this.reviewDocs[this.state.activeDoc] || this.reviewDocs.review;
          if (doc && doc.risks) {
            v.risks = v.risks.map(function (c, i) {
              var level = doc.risks[i] ? doc.risks[i].level : null;
              if (level === 'high') {
                c.riskLabel = '高风险';
                c.tagStyle = 'font-size:12px;font-weight:700;color:#fff;background:#dc2626;padding:3px 9px;border-radius:7px;';
                c.cardStyle = 'background:#fff;border:1px solid #fecaca;border-left:4px solid #dc2626;border-radius:15px;padding:14px;box-shadow:0 6px 18px rgba(220,38,38,0.06);';
              } else if (level === 'low') {
                c.riskLabel = '低风险';
                c.tagStyle = 'font-size:12px;font-weight:700;color:#fff;background:#d97706;padding:3px 9px;border-radius:7px;';
                c.cardStyle = 'background:#fff;border:1px solid #fde68a;border-left:4px solid #d97706;border-radius:15px;padding:14px;box-shadow:0 6px 18px rgba(217,119,6,0.06);';
              }
              return c;
            });
          }
        }
        return v;
      };
    }

    console.log('[qihe-bridge] Instance hooked');
  }

  // ===== 审查报告 Markdown → clauseData 解析 =====
  function parseReviewMarkdown(raw) {
    var result = [];
    // 先按 ### [...] 切分各风险块
    var blocks = raw.split(/\n###\s*\[/);
    for (var i = 1; i < blocks.length; i++) {
      var block = '[' + blocks[i];
      var m = block.match(/^\[(高风险|中风险|低风险)\]\s*(.+)/);
      if (!m) continue;
      var levelMap = { '高风险': 'high', '中风险': 'mid', '低风险': 'low' };
      var heading = (m[2] || '').trim();
      
      // 提取条款原文
      var bodyMatch = block.match(/>\s*条款原文[：:]\s*([\s\S]*?)(?=\n\s*风险描述|\n###|$)/);
      var body = bodyMatch ? bodyMatch[1].trim() : '';
      
      // 提取风险描述（到下一个 --- 或 ### 或文件末尾为止）
      var descMatch = block.match(/风险描述[：:]\s*([\s\S]*?)(?=\n---|\n###\s*\[|\n\*\*律师|$)/);
      var riskText = descMatch ? descMatch[1].trim() : '';
      
      result.push({
        heading: heading,
        body: body,
        level: levelMap[m[1]] || 'high',
        riskText: riskText,
      });
    }
    return result;
  }

  function isReviewText(text) {
    return /整体风险总结|风险明细|\[高风险\]|\[中风险\]|\[低风险\]/.test(text);
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
        // 审查报告检测：只展示整体风险总结到聊天框，结构化数据藏后台
        if (isReviewText(d.raw || '')) {
          var clauses = parseReviewMarkdown(d.raw || '');
          if (clauses.length > 0) {
            inst.clauseData = clauses;
            inst.reviewDocs = inst.reviewDocs || {};
            inst.reviewDocs.review = {
              title: '审查报告',
              risks: clauses.map(function (c) { return { clauseRef: c.heading, body: c.body, riskText: c.riskText, level: c.level }; }),
            };
            // 提取整体风险总结作为聊天文字
            var summaryMatch = (d.raw || '').match(/##\s*整体风险总结\s*\n([\s\S]*?)(?=\n---|\n##\s*风险明细|\n###\s*\[|$)/);
            var summary = summaryMatch ? summaryMatch[1].trim() : (d.text || '');
            // 替换聊天框最后一条消息为摘要
            var msgs = inst.state.messages || [];
            for (var i = msgs.length - 1; i >= 0; i--) {
              if (msgs[i].role === 'ai' && !msgs[i].type && (msgs[i].text || '').length > 20) {
                msgs[i] = Object.assign({}, msgs[i], { text: summary });
                break;
              }
            }
            // 不自动跳转详情：留在聊天页
            inst.setState({
              reviewLoading: false,
              chatOpen: true,
              review: null,
              activeDoc: 'review',
            });
          }
        }
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
