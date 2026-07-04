(function(){'use strict';
var H=new WeakSet();

function parseReview(raw){var r=[],bs=raw.split(/\n###\s*\[/);for(var i=1;i<bs.length;i++){var b='['+bs[i],m=b.match(/^\[(高风险|中风险|低风险)\]\s*(.+)/);if(!m)continue;var lv={'高风险':'high','中风险':'mid','低风险':'low'},hd=(m[2]||'').trim(),bm=b.match(/>\s*条款原文[：:]\s*([\s\S]*?)(?=\n\s*风险描述|\n###|$)/),body=bm?bm[1].trim():'',dm=b.match(/风险描述[：:]\s*([\s\S]*?)(?=\n---|\n###\s*\[|\n\*\*律师|$)/),desc=dm?dm[1].trim():'';r.push({heading:hd,body:body,level:lv[m[1]]||'high',riskText:desc});}return r}
function isReview(t){return /整体风险总结|风险明细|\[高风险\]|\[中风险\]|\[低风险\]/.test(t)}

// --- 颜色修正 ---
function fixColors(){try{
  document.querySelectorAll('[style*="border-left"]').forEach(function(e){var t=e.textContent||'';if(/高风险/.test(t)){e.style.setProperty('border-left-color','#dc2626','important');e.style.setProperty('background','#fef2f2','important')}else if(/低风险/.test(t)){e.style.setProperty('border-left-color','#d97706','important');e.style.setProperty('background','#fffbeb','important')}});
  document.querySelectorAll('[style*="background"]').forEach(function(e){var x=(e.textContent||'').trim();if(x==='高风险'){e.style.setProperty('background','#dc2626','important');e.style.setProperty('color','#fff','important')}else if(x==='低风险'){e.style.setProperty('background','#d97706','important');e.style.setProperty('color','#fff','important')}});
}catch(_){}}

// --- 注入「查看风险报告」按钮 ---
var _btnInjected = false;
function injectReviewBtn(){
  if(_btnInjected) return;
  var I=window._qiheActiveInstance; if(!I||!I.clauseData||!I.clauseData.length) return;
  var bubbles=document.querySelectorAll('[class*="bubble"], [class*="msg"] [class*="ai"], [class*="chat"] [class*="ai"]');
  var lastAi=null; for(var i=bubbles.length-1;i>=0;i--){var b=bubbles[i];if(b.textContent&&b.textContent.length>20&&b.querySelector('[class*="review-btn"]')===null){lastAi=b;break}}
  if(!lastAi) return;
  // 防止重复
  if(document.getElementById('__qihe_review_btn')) return;
  var btn=document.createElement('div');
  btn.id='__qihe_review_btn';
  btn.textContent='查看风险报告';
  btn.style.cssText='display:inline-block;margin-top:10px;padding:9px 20px;border-radius:10px;background:linear-gradient(135deg,#3b82f6,#2563eb);color:#fff;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 4px 12px rgba(37,99,235,0.3);text-align:center;';
  btn.onclick=function(){if(I&&I.setState){I.setState({chatOpen:false})}};
  lastAi.appendChild(btn);
  _btnInjected = true;
}

// --- MutationObserver: 颜色 + 按钮 ---
var _mo=new MutationObserver(function(){
  fixColors();
  injectReviewBtn();
});
_mo.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['style']});

// --- Hook ---
function hook(I){if(H.has(I))return;H.add(I);window._qiheActiveInstance=I;
var oSH=I._sendHome,oSC=I._sendChat,oEW=I._exportWord,oSR=I._startReview;
I._sendHome=function(){var t=(this.state.text||'').trim();if(!t||(this.state.attachedFiles||[]).length)return oSH.call(this);if(!window.QiheAPI)return oSH.call(this);this._push('user',t);this.setState({text:'',chatOpen:true,thinking:true});window.QiheAPI.send(t)};
I._sendChat=function(){var t=(this.state.chatText||'').trim();if(!t)return;if(!window.QiheAPI)return oSC.call(this);this._push('user',t);this.setState({chatText:'',thinking:true});window.QiheAPI.send(t)};
I._exportWord=function(){if(window.QiheAPI&&this._currentContractContent){window.QiheAPI.downloadContract(this._currentContractContent,(this._currentContractName||'房屋租赁合同')+'.docx');this.setState({savedToast:true})}else oEW.call(this)};
I._startReview=function(name){if(!window.QiheAPI)return oSR.call(this,name);this.setState({reviewLoading:true,loadingStep:'正在解析文件结构…'});window.QiheAPI.send('请审查以下文件：'+(name||'合同文件'))};
if(!I.__b){I.__b=true;var oB=I.backHome;I.backHome=function(){if(this.state.chatOpen&&this.state.review==='detail'){this.setState({chatOpen:false})}else if(this.state.review==='detail'){this.setState({review:null,chatOpen:true})}else if(this.state.chatOpen){this.setState({chatOpen:false})}else if(oB)oB.call(this)}}
console.log('[qihe-bridge] hooked')}

// --- Dify SSE ---
window.addEventListener('qihe:stream',function(e){
var d=e.detail||{},I=window._qiheActiveInstance;if(!I||typeof I.setState!=='function')return;
if(d.done){I.setState({thinking:false});_btnInjected=false;
 if(d.contract){I.contractText=d.contract.body;I.contractArticles=d.contract.articles;I._currentContractContent=d.contract.body;I._currentContractName=d.contract.name;I.setState(function(s){return{messages:s.messages.concat([{role:'ai',text:'已根据你的需求拟定《'+d.contract.name+'》，请查看全文，点击「导出合同」保存到本地：'},{role:'ai',type:'doc'}])}})}
 else if(d.template){if(window.QiheAPI)window.QiheAPI.getTemplate(d.template).then(function(dt){I.contractText=dt.previewHtml||'';I._currentContractName=dt.name||d.template;I.setState(function(s){return{messages:s.messages.concat([{role:'ai',text:'为你调取标准合同模板《'+(dt.name||d.template)+'》：'},{role:'ai',type:'doc'}])}})}).catch(function(){I._push('ai','模板加载失败')})}
 else if(isReview(d.raw||'')){var cs=parseReview(d.raw||'');if(cs.length>0){I.clauseData=cs;I.reviewDocs=I.reviewDocs||{};I.reviewDocs.review={title:'审查报告',risks:cs.map(function(c){return{clauseRef:c.heading,body:c.body,riskText:c.riskText,level:c.level}})};var sm=(d.raw||'').match(/##\s*整体风险总结\s*\n([\s\S]*?)(?=\n---|\n##\s*风险明细|\n###\s*\[|$)/);var summary=sm?sm[1].trim():(d.text||'');var ms=I.state.messages||[];for(var i=ms.length-1;i>=0;i--)if(ms[i].role==='ai'&&!ms[i].type){ms[i]=Object.assign({},ms[i],{text:summary});break}I.setState({reviewLoading:false,review:'detail',reviewTab:'text',chatOpen:true,activeDoc:'review'});setTimeout(function(){fixColors();injectReviewBtn();},600)}}
 else if(d.text){I._push('ai',d.text)}
}else{I.setState({thinking:false});var ms=I.state.messages||[],li=ms.length-1;if(li>=0&&ms[li].role==='ai'&&!ms[li].type){ms[li]=Object.assign({},ms[li],{text:d.text})}else I._push('ai',d.text)}
});
window.addEventListener('qihe:error',function(e){var I=window._qiheActiveInstance;if(I){I.setState({thinking:false,busy:false});I._push('ai','抱歉，出错了：'+(e.detail.message||'请稍后重试'))}});
(function w(n){n=n||0;if(n>100)return;if(window.DCLogic&&window.DCLogic.prototype&&window.DCLogic.prototype.setState){var o=window.DCLogic.prototype.setState;window.DCLogic.prototype.setState=function(){hook(this);return o.apply(this,arguments)};return}setTimeout(function(){w(n+1)},150)})();
})();
