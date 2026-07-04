(function(){'use strict';
// 「查看风险详情」蓝色文字按钮样式
var _s=document.createElement('style');
_s.textContent='#__qihe_review_detail_btn{display:block!important;margin-top:10px!important;padding-top:9px!important;border-top:1px solid rgba(37,99,235,.14)!important;background:transparent!important;color:#2563eb!important;font-size:14px!important;font-weight:600!important;text-align:left!important;cursor:pointer!important;-webkit-user-select:none;user-select:none;line-height:1.4;white-space:nowrap}#__qihe_review_detail_btn::after{content:"\\203A";margin-left:5px;font-size:17px;line-height:1}#__qihe_review_detail_btn:active{opacity:.55}';
document.head.appendChild(_s);
var H=new WeakSet();

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
    // 标签胶囊背景：最近的带背景色祖先（含自身）
    var box=el,hop=0;while(box&&hop<4){var b=getComputedStyle(box).backgroundColor;if(b&&b!=='rgba(0, 0, 0, 0)')break;box=box.parentElement;hop++;}
    if(box)box.style.setProperty('background-color',s.c,'important');
    // 风险卡片左边框 + 浅色底
    var card=el,h2=0;while(card&&h2<6){var st=(card.getAttribute&&card.getAttribute('style'))||'';if(/border-left/.test(st)){card.style.setProperty('border-left-color',s.c,'important');card.style.setProperty('background',s.bg,'important');break;}card=card.parentElement;h2++;}
  }
}catch(_){}}

// ===== 打开现有的审查风险详情页 =====
function openReviewDetail(){var I=window._qiheActiveInstance;if(!I||typeof I.setState!=='function')return;
  I.setState({review:'detail',activeDoc:'review',reviewTab:'text',chatOpen:false});
  setTimeout(styleReviewLabels,60);setTimeout(styleReviewLabels,300);setTimeout(styleReviewLabels,700);}
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

var _mo=new MutationObserver(function(){var I=window._qiheActiveInstance;if(I&&I.state&&I.state.review==='detail')styleReviewLabels();injectReviewBtn();});
_mo.observe(document.documentElement,{childList:true,subtree:true,attributes:true});

function hook(I){if(H.has(I))return;H.add(I);window._qiheActiveInstance=I;
var oSH=I._sendHome,oSC=I._sendChat,oEW=I._exportWord,oSR=I._startReview;
// 新一轮发送前清掉上一轮的审查按钮
I._sendHome=function(){var t=(this.state.text||'').trim();if(!t||(this.state.attachedFiles||[]).length)return oSH.call(this);if(!window.QiheAPI)return oSH.call(this);clearReviewBtn();this._push('user',t);this.setState({text:'',chatOpen:true,thinking:true});window.QiheAPI.send(t)};
I._sendChat=function(){var t=(this.state.chatText||'').trim();if(!t)return;if(!window.QiheAPI)return oSC.call(this);clearReviewBtn();this._push('user',t);this.setState({chatText:'',thinking:true});window.QiheAPI.send(t)};
I._exportWord=function(){if(window.QiheAPI&&this._currentContractContent){window.QiheAPI.downloadContract(this._currentContractContent,(this._currentContractName||'房屋租赁合同')+'.docx');this.setState({savedToast:true})}else oEW.call(this)};
I._startReview=function(name){if(!window.QiheAPI)return oSR.call(this,name);clearReviewBtn();this.setState({reviewLoading:true,loadingStep:'正在解析文件结构…'});window.QiheAPI.send('请审查以下文件：'+(name||'合同文件'))};
// 返回导航：详情页 → 聊天页 → 首页（不再从聊天页误跳详情页）
if(!I.__b){I.__b=true;var oB=I.backHome;I.backHome=function(){
  if(this.state.review==='detail'){this.setState({review:null,chatOpen:true});setTimeout(injectReviewBtn,80);setTimeout(injectReviewBtn,300);}
  else if(this.state.chatOpen){this.setState({chatOpen:false});}
  else if(oB)oB.call(this);
}}
}

window.addEventListener('qihe:stream',function(e){
var d=e.detail||{},I=window._qiheActiveInstance;if(!I||typeof I.setState!=='function')return;
if(d.done){I.setState({thinking:false});
 if(d.contract){I.contractText=d.contract.body;I.contractArticles=d.contract.articles;I._currentContractContent=d.contract.body;I._currentContractName=d.contract.name;I.setState(function(s){return{messages:s.messages.concat([{role:'ai',text:'已根据你的需求拟定《'+d.contract.name+'》，请查看全文。点击「导出合同」保存到本地：'},{role:'ai',type:'doc'}])}})}
 else if(d.template){if(window.QiheAPI)window.QiheAPI.getTemplate(d.template).then(function(dt){I.contractText=dt.previewHtml||'';I._currentContractName=dt.name||d.template;I.setState(function(s){return{messages:s.messages.concat([{role:'ai',text:'为你调取标准合同模板《'+(dt.name||d.template)+'》：'},{role:'ai',type:'doc'}])}})}).catch(function(){I._push('ai','模板加载失败')})}
 else if(isReview(d.raw||'')){var cs=parseReview(d.raw||'');if(cs.length>0){
   I.clauseData=cs;
   I.reviewDocs=I.reviewDocs||{};
   I.reviewDocs.review={title:'审查报告',risks:cs.map(function(c){return{clauseRef:c.heading,body:c.body,riskText:c.riskText,level:c.level}})};
   var summary=(extractSummary(d.raw||'')||(d.text||'').trim()).replace(/\*\*(.+?)\*\*/g,'$1').replace(/^#{1,6}\s*/gm,'');
   I._reviewSummary=summary;I._reviewBtnPending=true;
   // 聊天页最后一条 AI 消息只保留「整体风险概括」这一段
   var ms=(I.state.messages||[]).slice();for(var i=ms.length-1;i>=0;i--){if(ms[i].role==='ai'&&!ms[i].type){ms[i]=Object.assign({},ms[i],{text:summary});break}}
   // 停留在聊天页展示概括，不自动跳详情页；由用户点「查看风险详情」进入
   I.setState({reviewLoading:false,thinking:false,review:null,chatOpen:true,messages:ms});
   setTimeout(injectReviewBtn,120);setTimeout(injectReviewBtn,500);setTimeout(injectReviewBtn,1200);
 }else{I.setState({reviewLoading:false,thinking:false});if(d.text)I._push('ai',d.text)}}
 else if(d.text){I._push('ai',d.text)}
}else{I.setState({thinking:false});var ms=I.state.messages||[],li=ms.length-1;if(li>=0&&ms[li].role==='ai'&&!ms[li].type){ms[li]=Object.assign({},ms[li],{text:d.text})}else I._push('ai',d.text)}
});
window.addEventListener('qihe:error',function(e){var I=window._qiheActiveInstance;if(I){I.setState({thinking:false,busy:false});I._push('ai','抱歉，出错了：'+(e.detail.message||'请稍后重试'))}});
(function w(n){n=n||0;if(n>100)return;if(window.DCLogic&&window.DCLogic.prototype&&window.DCLogic.prototype.setState){var o=window.DCLogic.prototype.setState;window.DCLogic.prototype.setState=function(){hook(this);return o.apply(this,arguments)};return}setTimeout(function(){w(n+1)},150)})();
})();
