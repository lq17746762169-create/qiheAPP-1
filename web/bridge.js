(function(){'use strict';
console.log('[qihe bridge] 版本 nav-fix-20260705k 已加载（分流返回+Markdown+去灵动岛）');
// 「查看风险详情」蓝色文字按钮样式
var _s=document.createElement('style');
_s.textContent='#__qihe_review_detail_btn{display:block!important;margin-top:10px!important;padding-top:9px!important;border-top:1px solid rgba(37,99,235,.14)!important;background:transparent!important;color:#2563eb!important;font-size:14px!important;font-weight:600!important;text-align:left!important;cursor:pointer!important;-webkit-user-select:none;user-select:none;line-height:1.4;white-space:nowrap}#__qihe_review_detail_btn::after{content:"\\203A";margin-left:5px;font-size:17px;line-height:1}#__qihe_review_detail_btn:active{opacity:.55}';
document.head.appendChild(_s);
var H=new WeakSet();

function escHtml(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function sanitizeHtmlBasic(html){
  var h=String(html||'');
  h=h.replace(/<\s*(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi,'');
  h=h.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi,'').replace(/\son[a-z]+\s*=\s*'[^']*'/gi,'');
  h=h.replace(/\shref\s*=\s*(['"])\s*javascript:[\s\S]*?\1/gi,'');
  return h;
}
function looksLikeHtmlBlock(t){
  var s=String(t||'').trim();
  if(!s||s.charAt(0)!=='<'||s.indexOf('>')<0)return false;
  return /<\s*(p|div|span|strong|em|ul|ol|li|br|h[1-6]|blockquote|code|pre)\b/i.test(s) && /<\s*\/\s*(p|div|span|strong|em|ul|ol|li|h[1-6]|blockquote|code|pre)\s*>/i.test(s);
}
function mdToHtml(t){
  var src=String(t||'').replace(/\r\n/g,'\n');
  var blocks=[],codes=[];
  src=src.replace(/```[\w-]*\n?([\s\S]*?)```/g,function(_,code){blocks.push('<pre style="margin:8px 0;padding:10px;background:#f3f4f6;border-radius:8px;white-space:pre-wrap;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:1.45">'+escHtml((code||'').trim())+'</pre>');return '\u0001B'+(blocks.length-1)+'\u0001';});
  src=src.replace(/`([^`]+)`/g,function(_,code){codes.push('<code style="padding:0 4px;background:#f3f4f6;border-radius:4px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace">'+escHtml(code)+'</code>');return '\u0001C'+(codes.length-1)+'\u0001';});
  var h=escHtml(src);
  h=h.replace(/^#{1,6}\s+(.+)$/gm,'<strong>$1</strong>');
  h=h.replace(/\*\*([\s\S]*?)\*\*/g,function(_,m){return '<strong>'+m.replace(/\n/g,'<br>')+'</strong>'});
  h=h.replace(/\u0001B(\d+)\u0001/g,function(_,i){return blocks[+i]||''});
  h=h.replace(/\u0001C(\d+)\u0001/g,function(_,i){return codes[+i]||''});
  return h.replace(/\n/g,'<br>');
}
function applyMarkdownDom(){try{
  var all=document.querySelectorAll('*');
  for(var i=0;i<all.length;i++){
    var el=all[i];
    if(el.children.length)continue;
    if(el.id==='__qihe_review_detail_btn')continue;
    var txt=el.textContent||'';
    var hasMd=/(\*\*[\s\S]*?\*\*|`[^`]+`|```|^#{1,6}\s+)/m.test(txt);
    var hasHtml=looksLikeHtmlBlock(txt);
    var key=txt;
    if(!hasMd&&!hasHtml)continue;
    if(el.dataset&&el.dataset.qiheMdSrc===key)continue; // 内容未变就不重复渲染
    if(hasHtml)el.innerHTML=sanitizeHtmlBasic(txt);
    else el.innerHTML=mdToHtml(txt);
    if(el.dataset){el.dataset.qiheMd='1';el.dataset.qiheMdSrc=key;}
  }
}catch(_){}}
function hideDynamicIsland(){try{
  var all=document.querySelectorAll('div');
  for(var i=0;i<all.length;i++){
    var el=all[i];if(!el||!el.offsetParent)continue;
    var r=el.getBoundingClientRect();if(r.top>70||r.width<90||r.width>190||r.height<20||r.height>56)continue;
    var cs=getComputedStyle(el),bg=cs.backgroundColor||'',br=parseFloat(cs.borderTopLeftRadius||'0');
    if((bg==='rgb(0, 0, 0)'||bg==='rgba(0, 0, 0, 1)')&&br>=12){
      el.style.setProperty('display','none','important');
    }
  }
}catch(_){}}

// ===== 解析 Dify 审查报告（三段式：标签+标题 → 条款原文 → 风险描述）=====
function parseReview(raw){var r=[],bs=raw.split(/\n###\s*\[/);for(var i=1;i<bs.length;i++){var b='['+bs[i],m=b.match(/^\[(高风险|中风险|低风险)\]\s*(.+)/);if(!m)continue;var lv={'高风险':'high','中风险':'mid','低风险':'low'},hd=(m[2]||'').trim(),bm=b.match(/>\s*条款原文[：:]\s*([\s\S]*?)(?=\n\s*风险描述|\n###|$)/),body=bm?bm[1].trim():'',dm=b.match(/风险描述[：:]\s*([\s\S]*?)(?=\n---|\n###\s*\[|\n\*\*律师|$)/),desc=dm?dm[1].trim():'';r.push({heading:hd,body:body,level:lv[m[1]]||'high',riskText:desc});}return r}
function isReview(t){return /整体风险总结|风险明细|\[高风险\]|\[中风险\]|\[低风险\]/.test(t)}
// 提取「整体风险概括」，作为聊天页只展示的那一段。
// 兼容两种真实输出：带「## 整体风险总结」标题，或直接以概括段落开头（模型常省略标题）。
function extractSummary(raw){
  raw=(raw||'').replace(/\r\n/g,'\n');
  var m=raw.match(/#{1,6}\s*整体风险总结\s*\n([\s\S]*?)(?=\n-{3,}|\n#{1,6}\s*风险明细|\n#{1,6}\s*\[|$)/);
  if(m&&m[1].trim())return m[1].trim();
  // 回退：取首个「---」/「风险明细」/风险条目之前的内容作为概括
  var idx=raw.search(/\n-{3,}|\n#{1,6}\s*风险明细|\n#{1,6}\s*\[/);
  var head=idx>=0?raw.slice(0,idx):raw;
  return head.replace(/^\s*#{1,6}\s*整体风险(总结)?\s*/,'').trim();
}

// 详情页风险标签修正：编译后的应用把每个风险标签都硬编码渲染成「高风险」（红），
// 从不读取风险等级。这里按解析出的等级顺序，逐个把标签文字与配色改对。
// 只有两级：高风险→红，低风险→黄（非 high 一律按低风险处理）。
var RISK_STYLE={
  high:{t:'高风险',c:'#dc2626',bg:'#fef2f2'},
  low:{t:'低风险',c:'#eab308',bg:'#fefce8'},
};
function resetReviewLabelStyles(){try{
  var ts=document.querySelectorAll('[data-qihe-risk-text]'),bs=document.querySelectorAll('[data-qihe-risk-box]'),cs=document.querySelectorAll('[data-qihe-risk-card]');
  for(var i=0;i<ts.length;i++){var t=ts[i];t.style.removeProperty('color');t.removeAttribute('data-qihe-risk-text');}
  for(var j=0;j<bs.length;j++){var b=bs[j];b.style.removeProperty('background-color');b.removeAttribute('data-qihe-risk-box');}
  for(var k=0;k<cs.length;k++){var c=cs[k];c.style.removeProperty('border-left-color');c.style.removeProperty('background');c.removeAttribute('data-qihe-risk-card');}
}catch(_){}}
function styleReviewLabels(){try{
  var I=window._qiheActiveInstance;
  if(!I||!I.state||I.state.review!=='detail')return;
  var levels=(I.clauseData||[]).map(function(c){return c.level==='high'?'high':'low'});
  if(!levels.length)return;
  // 收集当前可见的风险标签叶子（文本为 高/中/低 风险），按文档顺序 = 风险条目顺序
  var labels=[],all=document.querySelectorAll('*');
  for(var i=0;i<all.length;i++){var el=all[i];if(el.children.length)continue;var t=(el.textContent||'').trim();if(t==='高风险'||t==='中风险'||t==='低风险'){var r=el.getBoundingClientRect();if(r.width>0&&el.offsetParent)labels.push(el);}}
  for(var j=0;j<labels.length&&j<levels.length;j++){
    var s=RISK_STYLE[levels[j]]||RISK_STYLE.high,el=labels[j];
    if(el.textContent.trim()!==s.t)el.textContent=s.t;
    el.style.setProperty('color','#fff','important');
    el.setAttribute('data-qihe-risk-text','1');
    // 标签胶囊背景：最近的带背景色祖先（含自身）
    var box=el,hop=0;while(box&&hop<4){var b=getComputedStyle(box).backgroundColor;if(b&&b!=='rgba(0, 0, 0, 0)')break;box=box.parentElement;hop++;}
    if(box){box.style.setProperty('background-color',s.c,'important');box.setAttribute('data-qihe-risk-box','1');}
    // 风险卡片左边框 + 浅色底
    var card=el,h2=0;while(card&&h2<6){var st=(card.getAttribute&&card.getAttribute('style'))||'';if(/border-left/.test(st)){card.style.setProperty('border-left-color',s.c,'important');card.style.setProperty('background',s.bg,'important');card.setAttribute('data-qihe-risk-card','1');break;}card=card.parentElement;h2++;}
  }
}catch(_){}}

// ===== 打开现有的审查风险详情页 =====
function openReviewDetail(){var I=window._qiheActiveInstance;if(!I||typeof I.setState!=='function')return;
  I.__reviewBackToChat=!!(I.state&&I.state.chatOpen); // 聊天入口进详情：返回应回聊天
  I.setState({review:'detail',activeDoc:'review',reviewTab:'text',chatOpen:false});
  setTimeout(styleReviewLabels,60);setTimeout(styleReviewLabels,300);setTimeout(styleReviewLabels,700);
  setTimeout(applyMarkdownDom,80);setTimeout(applyMarkdownDom,300);}
window.__qiheOpenReview=openReviewDetail;

// ===== 在「整体风险概括」气泡内底部注入蓝色「查看合同风险」按钮 =====
// 锚定策略：定位承载概括文本的最深叶子 → 向上找到气泡盒（带 max-width 的样式），
// 把按钮追加到气泡内部底部，保证按钮出现在概括下方且横向正常显示。
function injectReviewBtn(){
  var I=window._qiheActiveInstance;
  if(!I||!I._reviewBtnPending||!I.clauseData||!I.clauseData.length)return;
  if(!I.state||!I.state.chatOpen||I.state.review==='detail')return; // 仅在聊天页注入
  if(document.getElementById('__qihe_review_detail_btn'))return;
  var summary=I._reviewSummary||'';
  var key=summary.replace(/\s/g,'').slice(0,12);
  if(!key)return;
  // 找到承载概括文本的最深叶子
  var all=document.querySelectorAll('*'),leaf=null;
  for(var i=all.length-1;i>=0;i--){var el=all[i];if(el.children.length)continue;if((el.textContent||'').replace(/\s/g,'').indexOf(key)>=0){leaf=el;break;}}
  if(!leaf)return;
  // 向上找到气泡盒（内联样式含 max-width），把按钮加到气泡内底部
  var bubble=leaf,hop=0;
  while(bubble&&hop<5){var st=(bubble.getAttribute&&bubble.getAttribute('style'))||'';if(/max-width/.test(st))break;bubble=bubble.parentElement;hop++;}
  if(!bubble||!bubble.appendChild)bubble=leaf.parentElement||leaf;
  var btn=document.createElement('div');
  btn.id='__qihe_review_detail_btn';
  btn.textContent='查看合同风险';
  btn.addEventListener('click',function(ev){ev.stopPropagation();openReviewDetail();});
  bubble.appendChild(btn);
}
function clearReviewBtn(){var I=window._qiheActiveInstance;if(I)I._reviewBtnPending=false;var b=document.getElementById('__qihe_review_detail_btn');if(b)b.remove();}

var _mo=new MutationObserver(function(){var I=window._qiheActiveInstance;if(I&&I.state&&I.state.review==='detail')styleReviewLabels();else resetReviewLabelStyles();injectReviewBtn();applyMarkdownDom();hideDynamicIsland();});
_mo.observe(document.documentElement,{childList:true,subtree:true,attributes:true});

function hook(I){if(H.has(I))return;H.add(I);window._qiheActiveInstance=I;
var oSH=I._sendHome,oSC=I._sendChat,oEW=I._exportWord,oSR=I._startReview;
// 新一轮发送前清掉上一轮的审查按钮
I._sendHome=function(){var t=(this.state.text||'').trim();if(!t||(this.state.attachedFiles||[]).length)return oSH.call(this);if(!window.QiheAPI)return oSH.call(this);clearReviewBtn();this._push('user',t);this.setState({text:'',chatOpen:true,thinking:true});window.QiheAPI.send(t)};
I._sendChat=function(){var t=(this.state.chatText||'').trim();if(!t)return;if(!window.QiheAPI)return oSC.call(this);clearReviewBtn();this._push('user',t);this.setState({chatText:'',thinking:true});window.QiheAPI.send(t)};
I._exportWord=function(){if(window.QiheAPI&&this._currentContractContent){window.QiheAPI.downloadContract(this._currentContractContent,(this._currentContractName||'房屋租赁合同')+'.docx');this.setState({savedToast:true})}else oEW.call(this)};
I._startReview=function(name){
  if(!window.QiheAPI)return oSR.call(this,name);
  clearReviewBtn();
  // 审查统一走应用原生流程（含文件上传解析链路），避免自定义提示词干扰 Dify 工作流判断。
  // 仅在进入审查前清理会话，降低上一轮上下文串扰概率。
  if(typeof window.QiheAPI.clearHistory==='function')window.QiheAPI.clearHistory();
  return oSR.call(this,name);
};
// 返回导航：详情页 → 聊天页 → 首页（不再从聊天页误跳详情页）
if(!I.__b){I.__b=true;var oB=I.backHome;I.backHome=function(){
  if(this.state.review==='detail'){
    var toChat=!!this.__reviewBackToChat;
    this.__reviewBackToChat=false;
    resetReviewLabelStyles();
    this.setState({review:null,chatOpen:toChat});
    if(toChat){setTimeout(injectReviewBtn,80);setTimeout(injectReviewBtn,300);}
  }
  else if(this.state.chatOpen){this.setState({chatOpen:false});}
  else if(oB)oB.call(this);
}}
}

window.addEventListener('qihe:stream',function(e){
var d=e.detail||{},I=window._qiheActiveInstance;if(!I||typeof I.setState!=='function')return;
if(d.done){I.setState({thinking:false,reviewLoading:false});
 if(d.contract){I.contractText=d.contract.body;I.contractArticles=d.contract.articles;I._currentContractContent=d.contract.body;I._currentContractName=d.contract.name;I.setState(function(s){return{messages:s.messages.concat([{role:'ai',text:'已根据你的需求拟定《'+d.contract.name+'》，请查看全文。点击「导出合同」保存到本地：'},{role:'ai',type:'doc'}])}})}
 else if(d.template){if(window.QiheAPI)window.QiheAPI.getTemplate(d.template).then(function(dt){I.contractText=dt.previewHtml||'';I._currentContractName=dt.name||d.template;I.setState(function(s){return{messages:s.messages.concat([{role:'ai',text:'为你调取标准合同模板《'+(dt.name||d.template)+'》：'},{role:'ai',type:'doc'}])}})}).catch(function(){I._push('ai','模板加载失败')})}
 else if(isReview(d.raw||'')){var cs=parseReview(d.raw||'');if(cs.length>0){
   I.clauseData=cs;
   I.reviewDocs=I.reviewDocs||{};
   I.reviewDocs.review={title:'审查报告',risks:cs.map(function(c){return{clauseRef:c.heading,body:c.body,riskText:c.riskText,level:c.level}})};
   var summary=(extractSummary(d.raw||'')||(d.text||'').trim());
   I._reviewSummary=summary;I._reviewBtnPending=true;
   // 聊天页最后一条 AI 消息只保留「整体风险概括」这一段
   var ms=(I.state.messages||[]).slice();for(var i=ms.length-1;i>=0;i--){if(ms[i].role==='ai'&&!ms[i].type){ms[i]=Object.assign({},ms[i],{text:summary});break}}
   // 停留在聊天页展示概括，不自动跳详情页；由用户点「查看风险详情」进入
   I.setState({reviewLoading:false,thinking:false,review:null,chatOpen:true,messages:ms});
   setTimeout(injectReviewBtn,120);setTimeout(injectReviewBtn,500);setTimeout(injectReviewBtn,1200);
   setTimeout(applyMarkdownDom,100);setTimeout(applyMarkdownDom,400);
 }else{I.setState({reviewLoading:false,thinking:false});if(d.text)I._push('ai',d.text)}}
 else if(d.text){
  var msd=I.state.messages||[],lid=msd.length-1;
  if(lid>=0&&msd[lid].role==='ai'&&!msd[lid].type){msd=msd.slice();msd[lid]=Object.assign({},msd[lid],{text:d.text});I.setState({messages:msd});}
  else I._push('ai',d.text);
 }
}else{I.setState({thinking:false});var ms=I.state.messages||[],li=ms.length-1;if(li>=0&&ms[li].role==='ai'&&!ms[li].type){ms[li]=Object.assign({},ms[li],{text:d.text})}else I._push('ai',d.text);setTimeout(applyMarkdownDom,40)}
});
window.addEventListener('qihe:error',function(e){var I=window._qiheActiveInstance;if(I){I.setState({thinking:false,busy:false,reviewLoading:false});I._push('ai','抱歉，出错了：'+(e.detail.message||'请稍后重试'))}});
(function w(n){n=n||0;if(n>100)return;if(window.DCLogic&&window.DCLogic.prototype&&window.DCLogic.prototype.setState){var o=window.DCLogic.prototype.setState;window.DCLogic.prototype.setState=function(u){hook(this);
  // 记录进入详情页前是否在聊天页：聊天入口进详情应回聊天；最近记录进详情应回首页。
  if(u&&typeof u==='object'&&u.review==='detail'){this.__reviewBackToChat=!!(this.state&&this.state.chatOpen)}
  if(u&&typeof u==='object'&&u.review===null&&this.state&&this.state.review==='detail'){
    var toChat=!!this.__reviewBackToChat;
    this.__reviewBackToChat=false;
    u=Object.assign({},u,{chatOpen:toChat});
    if(toChat){setTimeout(injectReviewBtn,80);setTimeout(injectReviewBtn,300);setTimeout(injectReviewBtn,700);}
    console.log('[qihe bridge] 捕获详情页返回，目标=',toChat?'聊天页':'首页',u);
    return o.call(this,u);
  }
  var r=o.apply(this,arguments);setTimeout(applyMarkdownDom,20);setTimeout(hideDynamicIsland,20);return r};return}setTimeout(function(){w(n+1)},150)})();
setTimeout(hideDynamicIsland,50);setTimeout(hideDynamicIsland,300);setTimeout(hideDynamicIsland,1000);
})();
