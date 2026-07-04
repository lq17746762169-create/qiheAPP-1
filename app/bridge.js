/**
 * qihe · dc-runtime bridge v3
 * - 颜色: DOM MutationObserver 直接在渲染后修色
 * - 用户消息: sendHome 合并 setState 确保不丢失
 * - 导航: 聊天层+详情层叠加, backHome 切换
 */
(function () { 'use strict';

var _hooked = new WeakSet();

// -------- 审查报告解析 --------
function parseReview(raw) {
  var r = [], blocks = raw.split(/\n###\s*\[/);
  for (var i = 1; i < blocks.length; i++) {
    var b = '[' + blocks[i];
    var m = b.match(/^\[(高风险|中风险|低风险)\]\s*(.+)/); if (!m) continue;
    var lv = { '高风险':'high','中风险':'mid','低风险':'low' };
    var h = (m[2]||'').trim();
    var bm = b.match(/>\s*条款原文[：:]\s*([\s\S]*?)(?=\n\s*风险描述|\n###|$)/);
    var body = bm ? bm[1].trim() : '';
    var dm = b.match(/风险描述[：:]\s*([\s\S]*?)(?=\n---|\n###\s*\[|\n\*\*律师|$)/);
    var desc = dm ? dm[1].trim() : '';
    r.push({ heading:h, body:body, level:lv[m[1]]||'high', riskText:desc });
  }
  return r;
}
function isReview(t) { return /整体风险总结|风险明细|\[高风险\]|\[中风险\]|\[低风险\]/.test(t); }

// -------- DOM 颜色（渲染后修正） --------
function fixColors() {
  try {
    document.querySelectorAll('[style*="border-left"]').forEach(function(e){
      var t = e.textContent||'';
      if (/高风险/.test(t)){ e.style.setProperty('border-left-color','#dc2626','important'); e.style.setProperty('background','#fef2f2','important'); }
      else if(/低风险/.test(t)){ e.style.setProperty('border-left-color','#d97706','important'); e.style.setProperty('background','#fffbeb','important'); }
    });
    document.querySelectorAll('[style*="background"]').forEach(function(e){
      var x = (e.textContent||'').trim();
      if(x==='高风险'){ e.style.setProperty('background','#dc2626','important'); e.style.setProperty('color','#fff','important'); }
      else if(x==='低风险'){ e.style.setProperty('background','#d97706','important'); e.style.setProperty('color','#fff','important'); }
    });
  }catch(_){}
}
var _obs = new MutationObserver(function(){ fixColors(); });
_obs.observe(document.documentElement, { childList:true, subtree:true, attributes:true, attributeFilter:['style'] });

// -------- 实例 Hook --------
function hook(inst) {
  if (_hooked.has(inst)) return;
  _hooked.add(inst);
  window._qiheActiveInstance = inst;

  var oSH = inst._sendHome, oSC = inst._sendChat, oEW = inst._exportWord, oSR = inst._startReview;

  inst._sendHome = function(){
    var t = (this.state.text||'').trim(); if(!t||(this.state.attachedFiles||[]).length) return;
    if(!window.QiheAPI) return oSH.call(this);
    this.setState({ text:'', chatOpen:true, thinking:true, messages: this.state.messages.concat([{role:'user',text:t}]) });
    window.QiheAPI.send(t);
  };
  inst._sendChat = function(){
    var t = (this.state.chatText||'').trim(); if(!t) return;
    if(!window.QiheAPI) return oSC.call(this);
    this.setState({ chatText:'', thinking:true, messages: this.state.messages.concat([{role:'user',text:t}]) });
    window.QiheAPI.send(t);
  };
  inst._exportWord = function(){
    if(window.QiheAPI && this._currentContractContent){
      window.QiheAPI.downloadContract(this._currentContractContent, (this._currentContractName||'房屋租赁合同')+'.docx');
      this.setState({savedToast:true});
    }else oEW.call(this);
  };
  inst._startReview = function(name){
    if(!window.QiheAPI) return oSR.call(this,name);
    this.setState({ reviewLoading:true, loadingStep:'正在解析文件结构…' });
    window.QiheAPI.send('请审查以下文件：'+(name||'合同文件'));
  };

  // backHome 切换
  if(!inst.__b){
    inst.__b = true;
    var oB = inst.backHome;
    inst.backHome = function(){
      if(this.state.chatOpen && this.state.review==='detail') this.setState({chatOpen:false});
      else if(this.state.review==='detail') this.setState({review:null, chatOpen:true});
      else if(oB) oB.call(this); else this.setState({review:null});
    };
  }

  console.log('[qihe-bridge] hooked');
}

// -------- Dify SSE --------
window.addEventListener('qihe:stream', function(e){
  var d = e.detail||{}, I = window._qiheActiveInstance;
  if(!I||typeof I.setState!=='function') return;

  if(d.done){
    I.setState({thinking:false});
    if(d.contract){ // 合同
      I.contractText = d.contract.body; I.contractArticles = d.contract.articles;
      I._currentContractContent = d.contract.body; I._currentContractName = d.contract.name;
      I.setState(function(s){ return { messages: s.messages.concat([
        {role:'ai',text:'好的，已根据你的需求为你拟定一份《'+d.contract.name+'》，请查看全文。确认无误后，点击「导出合同」即可保存到本地：'},
        {role:'ai',type:'doc'}
      ])};});
    }else if(d.template){ // 模板
      if(window.QiheAPI) window.QiheAPI.getTemplate(d.template).then(function(dt){
        I.contractText = dt.previewHtml||''; I._currentContractName = dt.name||d.template;
        I.setState(function(s){ return { messages: s.messages.concat([
          {role:'ai',text:'好的，为你调取标准合同模板《'+(dt.name||d.template)+'》：'},{role:'ai',type:'doc'}
        ])};});
      }).catch(function(){I._push('ai','模板加载失败');});
    }else if(isReview(d.raw||'')){ // 审查
      var cs = parseReview(d.raw||'');
      if(cs.length>0){
        I.clauseData = cs;
        I.reviewDocs = I.reviewDocs||{};
        I.reviewDocs.review = { title:'审查报告', risks: cs.map(function(c){ return { clauseRef:c.heading, body:c.body, riskText:c.riskText, level:c.level }; }) };
        var sm = (d.raw||'').match(/##\s*整体风险总结\s*\n([\s\S]*?)(?=\n---|\n##\s*风险明细|\n###\s*\[|$)/);
        var summary = sm ? sm[1].trim() : '';
        if(summary){ var ms = I.state.messages||[]; for(var i=ms.length-1;i>=0;i--) if(ms[i].role==='ai'&&!ms[i].type&&summary){ I.state.messages[i] = Object.assign({},ms[i],{text:summary}); break; } }
        I.setState({ reviewLoading:false, review:'detail', reviewTab:'text', chatOpen:true, activeDoc:'review' });
        setTimeout(fixColors,200); setTimeout(fixColors,600);
      }
    }
  }else{
    I.setState({thinking:false});
    var ms2 = I.state.messages||[], l2 = ms2.length-1;
    if(l2>=0&&ms2[l2].role==='ai'&&!ms2[l2].type){ var nm=ms2.slice(); nm[l2]=Object.assign({},ms2[l2],{text:d.text}); I.state.messages = nm; }
    else I.state.messages = ms2.concat([{role:'ai',text:d.text}]);
  }
});

window.addEventListener('qihe:error', function(e){
  var I = window._qiheActiveInstance;
  if(I){ I.setState({thinking:false,busy:false}); I._push('ai','抱歉，出错了：'+(e.detail.message||'请稍后重试')); }
});

// -------- 启动 --------
function wait(n){
  n=n||0; if(n>100)return;
  if(window.DCLogic&&window.DCLogic.prototype&&window.DCLogic.prototype.setState){
    var o = window.DCLogic.prototype.setState;
    window.DCLogic.prototype.setState = function(){ hook(this); return o.apply(this,arguments); };
    console.log('[qihe-bridge] setState hooked'); return;
  }
  setTimeout(function(){wait(n+1);},150);
}
wait();
})();
