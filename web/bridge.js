(function(){'use strict';
console.log('[qihe bridge] 版本 nav-fix-20260705ah 已加载（左滑返回+模板调取+文件上传修复）');
// 「查看风险详情」蓝色文字按钮样式
var _s=document.createElement('style');
_s.textContent='#__qihe_review_detail_btn{display:block!important;margin-top:10px!important;padding-top:9px!important;border-top:1px solid rgba(37,99,235,.14)!important;background:transparent!important;color:#2563eb!important;font-size:14px!important;font-weight:600!important;text-align:left!important;cursor:pointer!important;-webkit-user-select:none;user-select:none;line-height:1.4;white-space:nowrap}#__qihe_review_detail_btn::after{content:"\\203A";margin-left:5px;font-size:17px;line-height:1}#__qihe_review_detail_btn:active{opacity:.55}';
document.head.appendChild(_s);
var H=new WeakSet();

// ===== 页面导航深度（配合 History API，修复 iOS 左滑直接退出 App）=====
function navDepth(st){
  if(!st)return 0;
  if(st.review==='detail')return 3;
  if(st.review==='upload'||st.reviewLoading)return 2;
  if(st.chatOpen)return 1;
  if(st.review)return 2;
  return 0;
}
function qiheGoBack(I){
  if(!I||!I.state)return false;
  var st=I.state;
  if(st.review==='detail'){I.backHome();return true;}
  if(st.reviewLoading||st.review==='upload'||st.review){
    I.setState({review:null,reviewLoading:false,chatOpen:false});
    return true;
  }
  if(st.chatOpen){I.setState({chatOpen:false});return true;}
  return false;
}
function syncNavHistory(prevSt,nextSt,self){
  var pd=navDepth(prevSt),nd=navDepth(nextSt);
  if(nd>pd)history.pushState({qihe:nd},'',location.href);
  else if(nd<pd&&!self.__qihePopHandling){
    self.__qihePopHandling=true;
    try{history.back();}catch(_){}
    setTimeout(function(){self.__qihePopHandling=false;},0);
  }
}
function initNavHistory(){
  if(window.__qiheNavInit)return;
  window.__qiheNavInit=true;
  history.replaceState({qihe:0},'',location.href);
  window.addEventListener('popstate',function(){
    var I=window._qiheActiveInstance;
    if(!I)return;
    I.__qihePopHandling=true;
    qiheGoBack(I);
    setTimeout(function(){I.__qihePopHandling=false;},0);
  });
}
initNavHistory();

function htmlToPlainText(html){
  var d=document.createElement('div');
  d.innerHTML=String(html||'');
  return (d.textContent||d.innerText||'').replace(/\r\n/g,'\n').trim();
}
function countArticlesPlain(text){
  var m=String(text||'').match(/第[一二三四五六七八九十百千零两0-9]+条/g);
  if(!m)return 0;
  var s={};for(var i=0;i<m.length;i++)s[m[i]]=1;
  return Object.keys(s).length;
}
function applyTemplateToInstance(I,dt,templateId){
  var html=dt.previewHtml||'';
  var plain=htmlToPlainText(html)||html;
  I._isTemplateDoc=true;
  I._currentTemplateId=templateId;
  I._currentContractName=dt.name||templateId;
  I._currentContractContent=plain;
  I.contractText=plain;
  I.contractArticles=countArticlesPlain(plain)||6;
}

// 捕获用户选择的真实文件对象（应用原生只保留文件名，无法读取内容）。
window.__qiheLastFile=null;

// ===== 文件上传（修复 iOS WKWebView 点 + 号不弹窗）=====
// iOS 上 display:none 的 input 无法被 .click() 唤起；且 dc-runtime 的 ref 可能未就绪。
var _filePickLock=0;
var _fallbackFileInput=null;
function fixOneFileInput(input){
  if(!input||input.type!=='file')return;
  input.style.setProperty('position','fixed','important');
  input.style.setProperty('top','0','important');
  input.style.setProperty('left','0','important');
  input.style.setProperty('width','1px','important');
  input.style.setProperty('height','1px','important');
  input.style.setProperty('opacity','0.01','important');
  input.style.setProperty('z-index','2147483646','important');
  input.style.setProperty('display','block','important');
  input.style.setProperty('pointer-events','none','important');
  input.setAttribute('data-qihe-file','1');
}
function fixFileInputs(){
  try{
    var inputs=document.querySelectorAll('input[type=file]');
    for(var i=0;i<inputs.length;i++)fixOneFileInput(inputs[i]);
  }catch(_){}
}
function getFallbackFileInput(multiple){
  if(!_fallbackFileInput){
    _fallbackFileInput=document.createElement('input');
    _fallbackFileInput.id='__qihe_file_fallback';
    _fallbackFileInput.type='file';
    _fallbackFileInput.accept='.pdf,.doc,.docx,image/*';
    _fallbackFileInput.style.cssText='position:fixed;top:0;left:0;width:1px;height:1px;opacity:0.01;z-index:2147483647;display:block;';
    document.documentElement.appendChild(_fallbackFileInput);
  }
  _fallbackFileInput.multiple=!!multiple;
  return _fallbackFileInput;
}
function isPlusButton(el){
  if(!el)return false;
  var btn=el.closest?el.closest('button'):null;
  if(!btn)return false;
  var path=btn.querySelector('svg path');
  if(!path)return false;
  var d=path.getAttribute('d')||'';
  return d.indexOf('M12 5v14')>=0&&d.indexOf('M5 12h14')>=0;
}
function detectFileContext(btn){
  var next=btn.nextElementSibling;
  while(next){
    if(next.tagName==='INPUT'&&next.type==='file')return{input:next,multiple:!!next.multiple};
    next=next.nextElementSibling;
  }
  var parent=btn.parentElement;
  if(parent){
    var inp=parent.querySelector('input[type=file]');
    if(inp)return{input:inp,multiple:!!inp.multiple};
  }
  return{input:null,multiple:false};
}
function handlePickedFiles(I,multiple,files){
  if(!I||!files||!files.length)return;
  window.__qiheLastFile=files[0];
  if(multiple){
    if(files.length>10){if(typeof I._showUploadToast==='function')I._showUploadToast();return;}
    var names=[];for(var i=0;i<files.length;i++)names.push(files[i].name);
    I.setState(function(s){return{attachedFiles:(s.attachedFiles||[]).concat(names).slice(0,10)};});
    return;
  }
  var f=files[0];
  if(I.state&&I.state.chatOpen){
    I.setState(function(s){return{messages:(s.messages||[]).concat([{role:'user',text:'📎 已上传：'+f.name}])};});
    if(typeof I._startReview==='function')I._startReview(f.name);
  }else if(typeof I._startReview==='function'){
    I._startReview(f.name);
  }
}
function openFilePicker(multiple,onDone){
  var input=getFallbackFileInput(multiple);
  input.value='';
  var done=false;
  var finish=function(files){
    if(done)return;done=true;
    input.removeEventListener('change',onChange);
    if(files&&files.length&&onDone)onDone(files);
  };
  var onChange=function(){
    finish(input.files?[].slice.call(input.files):[]);
    _filePickLock=0;
  };
  input.addEventListener('change',onChange);
  try{input.click();}catch(_){finish([]);_filePickLock=0;}
}
function triggerFilePickFromButton(btn){
  if(_filePickLock)return;
  var I=window._qiheActiveInstance;
  if(!I)return;
  _filePickLock=1;
  setTimeout(function(){_filePickLock=0;},3000);
  var ctx=detectFileContext(btn);
  var multiple=!!(ctx&&ctx.multiple);
  if(ctx&&ctx.input){
    fixOneFileInput(ctx.input);
    ctx.input.value='';
    var used=false;
    var onNative=function(){
      ctx.input.removeEventListener('change',onNative);
      if(used)return;used=true;
      var files=ctx.input.files?[].slice.call(ctx.input.files):[];
      if(files.length){_filePickLock=0;handlePickedFiles(I,multiple,files);return;}
      else openFilePicker(multiple,function(fs){handlePickedFiles(I,multiple,fs);});
    };
    ctx.input.addEventListener('change',onNative);
    try{ctx.input.click();return;}catch(_){}
  }
  openFilePicker(multiple,function(files){handlePickedFiles(I,multiple,files);});
}
function onFilePlusGesture(e){
  if(!isPlusButton(e.target))return;
  var btn=e.target.closest?e.target.closest('button'):null;
  if(!btn)return;
  e.preventDefault();
  e.stopPropagation();
  if(typeof e.stopImmediatePropagation==='function')e.stopImmediatePropagation();
  triggerFilePickFromButton(btn);
}
document.addEventListener('touchstart',onFilePlusGesture,{capture:true,passive:false});
document.addEventListener('click',onFilePlusGesture,true);
document.addEventListener('change',function(e){
  try{
    var t=e.target;
    if(t&&t.tagName==='INPUT'&&t.type==='file'&&t.files&&t.files.length){
      window.__qiheLastFile=t.files[0];
    }
  }catch(_){}
},true);

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
function parseReview(raw){
  raw=String(raw||'').replace(/\r\n/g,'\n');
  var r=[],bs=raw.split(/(?:^|\n)###\s*\[/);
  for(var i=1;i<bs.length;i++){
    var b='['+bs[i],m=b.match(/^\[(高风险|中风险|低风险)\]\s*([^\n]*)/);
    if(!m)continue;
    var lv={'高风险':'high','中风险':'mid','低风险':'low'},hd=(m[2]||'').trim();
    var bm=b.match(/(?:^|\n)\s*(?:>+\s*)?(?:条款原文|原文引用|引用原文|相关条款|合同原文)\s*[：:]\s*([\s\S]*?)(?=\n\s*(?:>+\s*)?(?:风险描述|风险说明)\s*[：:]|\n###\s*\[|\n---|$)/);
    var body=bm?bm[1].trim():'';
    if(!body){
      // 兼容仅用引用块写法：在“风险描述”前抓取连续引用行作为原文。
      var qb=b.match(/\n((?:\s*>\s*.+\n?){1,10})(?=\s*(?:风险描述|风险说明)\s*[：:])/);
      if(qb)body=(qb[1]||'').replace(/^\s*>\s?/gm,'').trim();
    }
    var dm=b.match(/(?:风险描述|风险说明)[：:]\s*([\s\S]*?)(?=\n---|\n###\s*\[|\n\*\*律师|$)/),desc=dm?dm[1].trim():'';
    r.push({heading:hd,body:body,level:lv[m[1]]||'high',riskText:desc});
  }
  return r;
}
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
  high:{t:'高风险',bg:'#dc2626',fg:'#ffffff'},
  low:{t:'低风险',bg:'#facc15',fg:'#422006'},
};
function resetReviewLabelStyles(){try{
  var ts=document.querySelectorAll('[data-qihe-risk-text]'),bs=document.querySelectorAll('[data-qihe-risk-box]'),cs=document.querySelectorAll('[data-qihe-risk-card]');
  for(var i=0;i<ts.length;i++){var t=ts[i];t.style.removeProperty('color');t.removeAttribute('data-qihe-risk-text');}
  for(var j=0;j<bs.length;j++){var b=bs[j];b.style.removeProperty('background-color');b.style.removeProperty('display');b.style.removeProperty('padding');b.style.removeProperty('border-radius');b.style.removeProperty('font-size');b.style.removeProperty('font-weight');b.style.removeProperty('line-height');b.style.removeProperty('letter-spacing');b.style.removeProperty('box-shadow');b.removeAttribute('data-qihe-risk-box');}
  for(var k=0;k<cs.length;k++){var c=cs[k];c.style.removeProperty('border-left-color');c.style.removeProperty('background');c.removeAttribute('data-qihe-risk-card');}
}catch(_){}}
function styleReviewLabels(){try{
  var I=window._qiheActiveInstance;
  if(!I||!I.state||I.state.review!=='detail')return;
  // 仅在「合同风险」详情容器中查找，避免误改聊天气泡。
  var scope=null,allTop=document.querySelectorAll('*');
  for(var si=0;si<allTop.length;si++){
    var top=allTop[si],txt=(top.textContent||'');
    if(!top.offsetParent)continue;
    if(txt.indexOf('合同风险')>=0&&/(高风险|中风险|低风险)/.test(txt)){scope=top;break;}
  }
  if(!scope)return;
  var levels=(I.clauseData||[]).map(function(c){return c.level==='high'?'high':'low'});
  // 收集当前可见的风险标签叶子（文本为 高/中/低 风险），按文档顺序 = 风险条目顺序
  var labels=[],all=scope.querySelectorAll('*');
  for(var i=0;i<all.length;i++){var el=all[i];if(el.children.length)continue;var t=(el.textContent||'').trim();if(t==='高风险'||t==='中风险'||t==='低风险'){var r=el.getBoundingClientRect();if(r.width>0&&el.offsetParent)labels.push(el);}}
  if(!labels.length)return;
  for(var j=0;j<labels.length;j++){
    var el=labels[j],raw=(el.textContent||'').trim();
    // clauseData 缺失时，按当前标签文字回退判断，保证重复进入也能稳定着色。
    var lv=levels[j]||(/^高风险$/.test(raw)?'high':'low');
    var s=RISK_STYLE[lv]||RISK_STYLE.low;
    if(el.textContent.trim()!==s.t)el.textContent=s.t;
    // 单层胶囊标签：只保留一个底色，避免多层色块叠加。
    el.style.setProperty('color',s.fg,'important');
    el.style.setProperty('background-color',s.bg,'important');
    el.style.setProperty('display','inline-block','important');
    el.style.setProperty('padding','3px 10px','important');
    el.style.setProperty('border-radius','999px','important');
    el.style.setProperty('font-size','12px','important');
    el.style.setProperty('font-weight','700','important');
    el.style.setProperty('line-height','1.25','important');
    el.style.setProperty('letter-spacing','0','important');
    el.style.setProperty('box-shadow','none','important');
    el.setAttribute('data-qihe-risk-text','1');
    el.setAttribute('data-qihe-risk-box','1');
    // 清掉标签外层小容器底色，防止“文字底色 + 容器底色”叠加。
    var p=el.parentElement,h=0;
    while(p&&h<3){
      var r=p.getBoundingClientRect(),bg=getComputedStyle(p).backgroundColor||'';
      if(r.width<=180&&r.height<=46&&bg!=='rgba(0, 0, 0, 0)'){
        p.style.setProperty('background-color','transparent','important');
        p.style.setProperty('box-shadow','none','important');
      }
      p=p.parentElement;h++;
    }
  }
}catch(_){}}

// ===== 打开现有的审查风险详情页 =====
function openReviewDetail(){var I=window._qiheActiveInstance;if(!I||typeof I.setState!=='function')return;
  I.__allowOpenDetailOnce=true; // 仅放行这次用户主动点击进入详情
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

var _mo=new MutationObserver(function(){fixFileInputs();var I=window._qiheActiveInstance;if(I&&I.state&&I.state.review==='detail')styleReviewLabels();else resetReviewLabelStyles();injectReviewBtn();applyMarkdownDom();hideDynamicIsland();});
// 仅监听节点增删，避免与样式/属性写入形成递归触发导致页面卡死。
_mo.observe(document.documentElement,{childList:true,subtree:true});

function hook(I){if(H.has(I))return;H.add(I);window._qiheActiveInstance=I;
var oSH=I._sendHome,oSC=I._sendChat,oEW=I._exportWord,oSR=I._startReview;
// 新一轮发送前清掉上一轮的审查按钮
I._sendHome=function(){var t=(this.state.text||'').trim();if(!t||(this.state.attachedFiles||[]).length)return oSH.call(this);if(!window.QiheAPI)return oSH.call(this);clearReviewBtn();this._push('user',t);this.setState({text:'',chatOpen:true,thinking:true});window.QiheAPI.send(t)};
I._sendChat=function(){var t=(this.state.chatText||'').trim();if(!t)return;if(!window.QiheAPI)return oSC.call(this);clearReviewBtn();this._push('user',t);this.setState({chatText:'',thinking:true});window.QiheAPI.send(t)};
I._exportWord=function(){
  if(window.QiheAPI&&this._isTemplateDoc&&this._currentTemplateId){
    window.QiheAPI.downloadTemplate(this._currentTemplateId);
    this.setState({savedToast:true});
    return;
  }
  if(window.QiheAPI&&this._currentContractContent){
    window.QiheAPI.downloadContract(this._currentContractContent,(this._currentContractName||'房屋租赁合同')+'.docx');
    this.setState({savedToast:true});
    return;
  }
  oEW.call(this);
};
I._startReview=function(name){
  if(!window.QiheAPI)return oSR.call(this,name);
  clearReviewBtn();
  var self=this,file=window.__qiheLastFile||null;
  // 期望进入「概括+查看合同风险按钮」流程，拦截自动跳详情。
  this.__expectSummaryFlow=true;
  this.__allowOpenDetailOnce=false;
  if(typeof window.QiheAPI.clearHistory==='function')window.QiheAPI.clearHistory();
  // 展示原生「审查中」加载页；文字进度仅做视觉过渡，真正结束由 Dify 流式 done 控制。
  this.setState({reviewLoading:true,loadingStep:'正在解析文件结构…',chatOpen:false,review:null});
  clearTimeout(this._qhL1);clearTimeout(this._qhL2);
  this._qhL1=setTimeout(function(){if(self.state&&self.state.reviewLoading)self.setState({loadingStep:'识别合同条款与主体…'});},1400);
  this._qhL2=setTimeout(function(){if(self.state&&self.state.reviewLoading)self.setState({loadingStep:'比对法规、标注风险点…'});},3200);
  if(file&&typeof window.QiheAPI.reviewWithFile==='function'){
    window.__qiheLastFile=null;
    window.QiheAPI.reviewWithFile(file);
  }else{
    // 拿不到文件对象时，退回按文件名请求，至少恢复旧的审查流程。
    window.QiheAPI.send('请审查以下合同文件：'+(name||'合同文件'));
  }
};
// 返回导航：详情页 → 聊天页 → 首页；上传/加载页 → 首页
if(!I.__b){I.__b=true;var oB=I.backHome;I.backHome=function(){
  if(this.state.review==='detail'){
    var toChat=!!this.__reviewBackToChat;
    this.__reviewBackToChat=false;
    resetReviewLabelStyles();
    this.setState({review:null,chatOpen:toChat});
    if(toChat){setTimeout(injectReviewBtn,80);setTimeout(injectReviewBtn,300);}
  }
  else if(this.state.reviewLoading||this.state.review==='upload'||this.state.review){
    this.setState({review:null,reviewLoading:false,chatOpen:false});
  }
  else if(this.state.chatOpen){this.setState({chatOpen:false});}
  else if(oB)oB.call(this);
}}
}

window.addEventListener('qihe:stream',function(e){
var d=e.detail||{},I=window._qiheActiveInstance;if(!I||typeof I.setState!=='function')return;
if(d.done){clearTimeout(I._qhL1);clearTimeout(I._qhL2);I.setState({thinking:false,reviewLoading:false});
 if(d.contract){I._isTemplateDoc=false;I._currentTemplateId='';I.contractText=d.contract.body;I.contractArticles=d.contract.articles;I._currentContractContent=d.contract.body;I._currentContractName=d.contract.name;I.setState(function(s){return{messages:s.messages.concat([{role:'ai',text:'已根据你的需求拟定《'+d.contract.name+'》，请查看全文。点击「导出合同」保存到本地：'},{role:'ai',type:'doc'}])}})}
 else if(d.template){if(window.QiheAPI)window.QiheAPI.getTemplate(d.template).then(function(dt){applyTemplateToInstance(I,dt,d.template);I.setState(function(s){return{messages:s.messages.concat([{role:'ai',text:'为你调取标准合同模板《'+(dt.name||d.template)+'》：'},{role:'ai',type:'doc'}])}})}).catch(function(err){console.error('[qihe bridge] 模板加载失败',err);I._push('ai','模板加载失败，请检查网络后重试')})}
 else if(isReview(d.raw||'')){var cs=parseReview(d.raw||'');if(cs.length>0){
   I.clauseData=cs;
   I.reviewDocs=I.reviewDocs||{};
   I.reviewDocs.review={title:'审查报告',risks:cs.map(function(c){return{clauseRef:c.heading,body:c.body,riskText:c.riskText,level:c.level}})};
   var summary=(extractSummary(d.raw||'')||(d.text||'').trim());
   I._reviewSummary=summary;I._reviewBtnPending=true;
   // 聊天页最后一条 AI 消息只保留「整体风险概括」这一段；若无则新增一条。
   var ms=(I.state.messages||[]).slice(),found=false;for(var i=ms.length-1;i>=0;i--){if(ms[i].role==='ai'&&!ms[i].type){ms[i]=Object.assign({},ms[i],{text:summary});found=true;break}}
   if(!found)ms=ms.concat([{role:'ai',text:summary}]);
   // 停留在聊天页展示概括，不自动跳详情页；由用户点「查看风险详情」进入
   I.setState({reviewLoading:false,thinking:false,review:null,chatOpen:true,messages:ms});
   I.__expectSummaryFlow=false;
   setTimeout(injectReviewBtn,120);setTimeout(injectReviewBtn,500);setTimeout(injectReviewBtn,1200);
   setTimeout(applyMarkdownDom,100);setTimeout(applyMarkdownDom,400);
 }else{I.__expectSummaryFlow=false;I.setState({reviewLoading:false,thinking:false,chatOpen:true});if(d.text&&String(d.text).trim())I._push('ai',d.text)}}
 else if(d.text&&String(d.text).trim()){
  if(I.__expectSummaryFlow){I.__expectSummaryFlow=false;if(!I.state.chatOpen)I.setState({chatOpen:true});}
  var msd=I.state.messages||[],lid=msd.length-1;
  if(lid>=0&&msd[lid].role==='ai'&&!msd[lid].type){msd=msd.slice();msd[lid]=Object.assign({},msd[lid],{text:d.text});I.setState({messages:msd});}
  else I._push('ai',d.text);
 }
}else if(d.text&&String(d.text).trim()){I.setState({thinking:false});var ms=I.state.messages||[],li=ms.length-1;if(li>=0&&ms[li].role==='ai'&&!ms[li].type){ms[li]=Object.assign({},ms[li],{text:d.text})}else I._push('ai',d.text);setTimeout(applyMarkdownDom,40)}
});
window.addEventListener('qihe:error',function(e){var I=window._qiheActiveInstance;if(I){clearTimeout(I._qhL1);clearTimeout(I._qhL2);I.setState({thinking:false,busy:false,reviewLoading:false});I._push('ai','抱歉，出错了：'+(e.detail.message||'请稍后重试'))}});
(function w(n){n=n||0;if(n>100)return;if(window.DCLogic&&window.DCLogic.prototype&&window.DCLogic.prototype.setState){var o=window.DCLogic.prototype.setState;window.DCLogic.prototype.setState=function(u){var prevSt=this.state;hook(this);
  // 记录进入详情页前是否在聊天页：聊天入口进详情应回聊天；最近记录进详情应回首页。
  if(u&&typeof u==='object'&&u.review==='detail'){
    // 非用户主动点击时，拦截“自动跳详情”并留在聊天页，保持先看概括+按钮的流程。
    if(!this.__allowOpenDetailOnce&&this.state&&this.state.chatOpen&&(this._reviewBtnPending||this.__expectSummaryFlow)){
      u=Object.assign({},u,{review:null,chatOpen:true});
      setTimeout(injectReviewBtn,80);setTimeout(injectReviewBtn,300);setTimeout(injectReviewBtn,700);
      return o.call(this,u);
    }
    this.__allowOpenDetailOnce=false;
    this.__reviewBackToChat=!!(this.state&&this.state.chatOpen);
    setTimeout(styleReviewLabels,40);setTimeout(styleReviewLabels,180);setTimeout(styleReviewLabels,520)
  }
  if(u&&typeof u==='object'&&u.review===null&&this.state&&this.state.review==='detail'){
    // 若调用方（如 backHome）已显式给出 chatOpen，则尊重其决定，避免重复消费标记导致误跳首页。
    var toChat=(typeof u.chatOpen!=='undefined')?!!u.chatOpen:!!this.__reviewBackToChat;
    this.__reviewBackToChat=false;
    u=Object.assign({},u,{chatOpen:toChat});
    if(toChat){setTimeout(injectReviewBtn,80);setTimeout(injectReviewBtn,300);setTimeout(injectReviewBtn,700);}
    console.log('[qihe bridge] 捕获详情页返回，目标=',toChat?'聊天页':'首页',u);
    return o.call(this,u);
  }
  var r=o.apply(this,arguments);
  try{syncNavHistory(prevSt,this.state,this);}catch(_){}
  setTimeout(applyMarkdownDom,20);setTimeout(hideDynamicIsland,20);return r};return}setTimeout(function(){w(n+1)},150)})();
setTimeout(hideDynamicIsland,50);setTimeout(hideDynamicIsland,300);setTimeout(hideDynamicIsland,1000);
setTimeout(fixFileInputs,80);setTimeout(fixFileInputs,500);setTimeout(fixFileInputs,1500);
})();
