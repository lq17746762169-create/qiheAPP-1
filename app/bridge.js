/**
 * qihe bridge v5 - 精简版
 * 用户消息: 单次 setState 合并 messages
 * 导航: 审查→详情(可返回聊天)→聊天→首页
 * 颜色: MutationObserver 渲染后修色
 */
(function(){'use strict';

var H = new WeakSet();

function pReview(raw){var r=[];var bs=raw.split(/\n###\s*\[/);for(var i=1;i<bs.length;i++){var b='['+bs[i];var m=b.match(/^\[(高风险|中风险|低风险)\]\s*(.+)/);if(!m)continue;var lv={'高风险':'high','中风险':'mid','低风险':'low'};var hd=(m[2]||'').trim();var bm=b.match(/>\s*条款原文[：:]\s*([\s\S]*?)(?=\n\s*风险描述|\n###|$)/);var body=bm?bm[1].trim():'';var dm=b.match(/风险描述[：:]\s*([\s\S]*?)(?=\n---|\n###\s*\[|\n\*\*律师|$)/);var desc=dm?dm[1].trim():'';r.push({heading:hd,body:body,level:lv[m[1]]||'high',riskText:desc})}return r}
function iReview(t){return /整体风险总结|风险明细|\[高风险\]|\[中风险\]|\[低风险\]/.test(t)}

function fixC(){try{document.querySelectorAll('[style*="border-left"]').forEach(function(e){var t=e.textContent||'';if(/高风险/.test(t)){e.style.setProperty('border-left-color','#dc2626','important');e.style.setProperty('background','#fef2f2','important')}else if(/低风险/.test(t)){e.style.setProperty('border-left-color','#d97706','important');e.style.setProperty('background','#fffbeb','important')}});document.querySelectorAll('[style*="background"]').forEach(function(e){var x=(e.textContent||'').trim();if(x==='高风险'){e.style.setProperty('background','#dc2626','important');e.style.setProperty('color','#fff','important')}else if(x==='低风险'){e.style.setProperty('background','#d97706','important');e.style.setProperty('color','#fff','important')}})}catch(_){}}
new MutationObserver(function(){fixC()}).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['style']});

function hook(I){
  if(H.has(I))return;H.add(I);window._qiheActiveInstance=I;
  var oSH=I._sendHome,oSC=I._sendChat,oEW=I._exportWord,oSR=I._startReview;

  I._sendHome=function(){var t=(this.state.text||'').trim();if(!t)return;if((this.state.attachedFiles||[]).length)return oSH.call(this);if(!window.QiheAPI)return oSH.call(this);this.setState({messages:this.state.messages.concat([{role:'user',text:t}]),text:'',chatOpen:true,thinking:true});window.QiheAPI.send(t)};
  I._sendChat=function(){var t=(this.state.chatText||'').trim();if(!t)return;if(!window.QiheAPI)return oSC.call(this);this.setState({messages:this.state.messages.concat([{role:'user',text:t}]),chatText:'',thinking:true});window.QiheAPI.send(t)};
  I._exportWord=function(){if(window.QiheAPI&&this._currentContractContent){window.QiheAPI.downloadContract(this._currentContractContent,(this._currentContractName||'房屋租赁合同')+'.docx');this.setState({savedToast:true})}else oEW.call(this)};
  I._startReview=function(name){if(!window.QiheAPI)return oSR.call(this,name);this.setState({reviewLoading:true,loadingStep:'正在解析文件结构…'});window.QiheAPI.send('请审查以下文件：'+(name||'合同文件'))};
  if(!I.__b){I.__b=true;var oB=I.backHome;I.backHome=function(){if(this.state.review==='detail'&&this.state.chatOpen){this.setState({chatOpen:false})}else if(this.state.review==='detail'){this.setState({review:null,chatOpen:true})}else if(this.state.chatOpen){this.setState({chatOpen:false})}else if(oB)oB.call(this);else this.setState({review:null})}}
}

window.addEventListener('qihe:stream',function(e){
  var d=e.detail||{},I=window._qiheActiveInstance;if(!I||typeof I.setState!=='function')return;
  if(d.done){I.setState({thinking:false});
    if(d.contract){I.contractText=d.contract.body;I.contractArticles=d.contract.articles;I._currentContractContent=d.contract.body;I._currentContractName=d.contract.name;I.setState(function(s){return{messages:s.messages.concat([{role:'ai',text:'好的，已根据你的需求为你拟定一份《'+d.contract.name+'》，请查看全文。确认无误后，点击「导出合同」即可保存到本地：'},{role:'ai',type:'doc'}])}})};
    else if(d.template){if(window.QiheAPI)window.QiheAPI.getTemplate(d.template).then(function(dt){I.contractText=dt.previewHtml||'';I._currentContractName=dt.name||d.template;I.setState(function(s){return{messages:s.messages.concat([{role:'ai',text:'好的，为你调取标准合同模板《'+(dt.name||d.template)+'》：'},{role:'ai',type:'doc'}])}})}).catch(function(){I.setState(function(s){return{messages:s.messages.concat([{role:'ai',text:'模板加载失败'}]})}})};
    else if(iReview(d.raw||'')){var cs=pReview(d.raw||'');if(cs.length>0){I.clauseData=cs;I.reviewDocs=I.reviewDocs||{};I.reviewDocs.review={title:'审查报告',risks:cs.map(function(c){return{clauseRef:c.heading,body:c.body,riskText:c.riskText,level:c.level}})};
    var sm=(d.raw||'').match(/##\s*整体风险总结\s*\n([\s\S]*?)(?=\n---|\n##\s*风险明细|\n###\s*\[|$)/);var s=sm?sm[1].trim():(d.text||'');
    var ms=I.state.messages||[];for(var i=ms.length-1;i>=0;i--)if(ms[i].role==='ai'&&!ms[i].type&&s){ms[i]=Object.assign({},ms[i],{text:s});break}
    I.setState({reviewLoading:false,review:'detail',reviewTab:'text',chatOpen:false,activeDoc:'review'});setTimeout(fixC,300)}}}
    else if(d.text){I.setState(function(s){return{messages:s.messages.concat([{role:'ai',text:d.text}])}})}
  }else{I.setState({thinking:false});var ms=I.state.messages||[];if(ms.length&&ms[ms.length-1].role==='ai'&&!ms[ms.length-1].type){ms[ms.length-1]=Object.assign({},ms[ms.length-1],{text:d.text})}else I.setState(function(s){return{messages:s.messages.concat([{role:'ai',text:d.text}])}})}
});
window.addEventListener('qihe:error',function(e){var I=window._qiheActiveInstance;if(I){I.setState({thinking:false,busy:false});I.setState(function(s){return{messages:s.messages.concat([{role:'ai',text:'抱歉，出错了：'+(e.detail.message||'请稍后重试')}])}})}});
(function w(n){n=n||0;if(n>100)return;if(window.DCLogic&&window.DCLogic.prototype&&window.DCLogic.prototype.setState){var o=window.DCLogic.prototype.setState;window.DCLogic.prototype.setState=function(){hook(this);return o.apply(this,arguments)};return}setTimeout(function(){w(n+1)},150)})();
})();
