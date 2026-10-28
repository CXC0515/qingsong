import '../../../src/components/glass/runtime/liquid-glass.css';
import './style.css';
import {mountGlass} from '../../../src/components/glass/runtime/liquid-glass.js';
import {mountSegmented} from '../../../src/components/glass/runtime/segmented.js';
const $=s=>document.querySelector(s);
const paths={settings:'<path d="m9.7 4.3.5-2h3.6l.5 2 1.8 1 2-.6 1.8 3.1-1.5 1.5v2.1l1.5 1.5-1.8 3.1-2-.6-1.8 1-.5 2h-3.6l-.5-2-1.8-1-2 .6L2.2 13l1.5-1.5V9.4L2.2 7.9 4 4.8l2 .6z" transform="translate(1 2)"/><circle cx="12" cy="12" r="3"/>','panel-left':'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 3v18"/>',x:'<path d="m6 6 12 12M6 18 18 6"/>',plus:'<path d="M12 5v14M5 12h14"/>',chevron:'<path d="m9 6 6 6-6 6"/>',more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',search:'<circle cx="10.8" cy="10.8" r="7"/><path d="m16 16 4.5 4.5"/>','arrow-up':'<path d="M12 19V5m-6 6 6-6 6 6"/>',sliders:'<path d="M4 7h8m4 0h4M4 17h3m4 0h9"/><circle cx="14" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',rules:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',memory:'<path d="M6 3h12v18l-6-4-6 4z"/>'};
const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name]||paths.settings}</svg>`;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const materials=new Map();
function disposeWithin(root){for(const [host,api] of materials){if(root.contains(host)){api.destroy();materials.delete(host);}}}
function hydrate(root=document){root.querySelectorAll('[data-icon]').forEach(el=>{el.innerHTML=icon(el.dataset.icon);el.removeAttribute('data-icon');});root.querySelectorAll('.material').forEach(el=>{if(!materials.has(el))materials.set(el,mountGlass(el,{preset:'button',radius:16,theme:'light',lightAngle:225,reflection:1}));});}
const records=[
 {id:1,kind:'rules',content:'教案先列教学目标，再列教学过程；课堂活动给出具体的教师提问。',status:'active',updated:'今天',source:'本人添加',expiry:''},
 {id:2,kind:'rules',content:'回答尽量简洁，用中文说明；不确定的学生情况先查记录。',status:'active',updated:'昨天',source:'本人添加',expiry:''},
 {id:3,kind:'rules',content:'课堂建议优先考虑四十分钟内能够完成的安排。',status:'disabled',updated:'10月25日',source:'本人添加',expiry:''},
 {id:4,kind:'memory',content:'这学期想重点改善课堂讨论的参与度。',status:'active',updated:'今天',source:'课堂讨论怎么组织 · 今天',expiry:''},
 {id:5,kind:'memory',content:'备课时习惯先整理单元目标，再安排每节课的活动。',status:'active',updated:'昨天',source:'备课思路 · 昨天',expiry:''},
 {id:6,kind:'memory',content:'希望每周留出一次课后反思的时间。',status:'active',updated:'10月25日',source:'本人添加',expiry:''},
 {id:7,kind:'memory',content:'今后的课堂讨论，优先尝试先独立思考、再小组交流。',status:'candidate',updated:'今天',source:'课堂讨论怎么组织 · 今天',expiry:''},
 {id:8,kind:'memory',content:'希望教案中的课堂活动附上预计用时。',status:'candidate',updated:'昨天',source:'七年级的备课思路 · 昨天',expiry:''},
];
let section='rules',memoryFilter='saved',query='',current=null,initial='',initialExpiry='',toastTimer,confirmAction;
let metrics={human:70,auto:90,score:75};
const content=$('#settings-content');
const button=(id,label,primary=false)=>`<button id="${id}" class="material ${primary?'primary':''}" type="button"><span class="lg-content">${label}</span></button>`;
function heading(title,description,action=''){return `<header class="page-heading"><div><span class="eyebrow">AI 助手</span><h2>${title}</h2><p>${description}</p></div>${action}</header>`;}
function toast(text){clearTimeout(toastTimer);$('#toast').textContent=text;$('#toast').hidden=false;toastTimer=setTimeout(()=>$('#toast').hidden=true,3200);}
function renderLinks(){const data=[['metrics','sliders','OCR 与评分'],['rules','rules','个人规则'],['memory','memory','长期记忆']];$('#settings-links').innerHTML=data.map(([id,i,label])=>`<button class="settings-link" data-section="${id}" ${section===id?'aria-current="page"':''}>${icon(i)}${label}</button>`).join('');$('#settings-links').querySelectorAll('button').forEach(b=>b.onclick=()=>{section=b.dataset.section;query='';renderSettings();});}
function rows(){const selected=records.filter(r=>r.kind===section&&r.status!=='deleted'&&(section!=='memory'||(memoryFilter==='pending'?r.status==='candidate':r.status!=='candidate'))&&r.content.includes(query));return selected.length?selected.map(r=>`<button class="record-row" data-record="${r.id}" aria-label="查看${esc(r.content)}"><span class="row-copy"><span class="row-title">${esc(r.content)}</span><span class="row-subtitle"><span class="row-status ${r.status==='candidate'?'pending':''}">${{active:'已启用',disabled:'已停用',candidate:'待确认'}[r.status]}</span><span>${r.updated}${r.source==='本人添加'?' · 本人添加':''}</span></span></span>${icon('chevron')}</button>`).join(''):'<p class="empty">没有符合条件的记录。</p>';}
function wireRows(){content.querySelectorAll('[data-record]').forEach(b=>b.onclick=()=>openEntry(records.find(r=>r.id===Number(b.dataset.record))));}
function renderSettings(){disposeWithin(content);renderLinks();if(section==='metrics')renderMetrics();else if(section==='rules'){
 content.innerHTML=heading('个人规则','告诉助手，你习惯怎样工作。',button('new-entry',icon('plus')+'新增',true))+`<div class="row-list">${rows()}</div><p class="footnote">规则用于后续对话的默认工作方式。本次对话中的明确要求优先。</p>`;$('#new-entry').onclick=()=>openEntry(null);
 }else{
 const count=records.filter(r=>r.kind==='memory'&&r.status==='candidate').length;
 content.innerHTML=heading('长期记忆','查看和整理你确认保存的背景。',button('new-entry',icon('plus')+'新增',true))+(count&&memoryFilter==='saved'?`<div class="review-line"><span>${count} 条记忆待你确认</span><button id="review-pending">去查看 ${icon('chevron')}</button></div>`:'')+`<div class="memory-tools"><div class="segment-wrap"><div id="memory-segments"><button data-value="saved">已保存</button><button data-value="pending">待确认${count?' · '+count:''}</button></div></div><label class="search">${icon('search')}<input id="search-memory" type="search" aria-label="搜索记忆" placeholder="搜索记忆" value="${esc(query)}"></label></div><div class="row-list" id="memory-list">${rows()}</div><p class="footnote">只保留你希望助手记住的内容。未确认的建议不会作为记忆使用。</p>`;
 const host=$('#memory-segments');materials.set(host,mountSegmented(host,{value:memoryFilter,trackRim:false,liftPx:2,glass:{theme:'light',lightAngle:225,reflection:1},onChange:value=>{memoryFilter=value;query='';renderSettings();}}));
 $('#new-entry').onclick=()=>openEntry(null);if($('#review-pending'))$('#review-pending').onclick=()=>{memoryFilter='pending';renderSettings();};
 $('#search-memory').oninput=e=>{query=e.target.value;$('#memory-list').innerHTML=rows();wireRows();};
 }hydrate(content);wireRows();}
function control(key,title,value,min,max,step=1){return `<div class="metric-control ${key==='score'?'solo':''}"><label for="metric-${key}">${title}<output id="output-${key}" for="metric-${key}">${value}<small>%</small></output></label><input id="metric-${key}" type="range" value="${value}" min="${min}" max="${max}" step="${step}"></div>`;}
function renderMetrics(){content.innerHTML=heading('OCR 与评分','保留识别质量和评分置信度的调节入口。')+`<section class="metric-group"><h3>图像与 OCR 质检</h3><p>调整识别质量的参考阈值。</p><div class="metric-controls">${control('human','人工复核阈值',metrics.human,50,80,5)}${control('auto','自动通过阈值',metrics.auto,75,98)}</div></section><section class="metric-group"><h3>AI 评分置信度</h3><p>查看评分结果时使用的置信度参考。</p><div class="metric-controls">${control('score','评分置信度阈值',metrics.score,50,95,5)}</div></section><div class="metric-actions">${button('save-metrics','保存设置',true)}</div><p class="footnote">原型只演示阈值展示与调节。正式接入前需确认每个指标的实际作用和保存范围，不将页面调节等同于自动复核策略生效。</p>`;
 for(const key of ['human','auto','score'])$('#metric-'+key).oninput=e=>{let value=Number(e.target.value);if(key==='human')value=Math.min(value,Number($('#metric-auto').value)-5);if(key==='auto')value=Math.max(value,Number($('#metric-human').value)+5);e.target.value=value;$('#output-'+key).innerHTML=value+'<small>%</small>';};
 $('#save-metrics').onclick=()=>{for(const key of ['human','auto','score'])metrics[key]=Number($('#metric-'+key).value);toast('演示：阈值已保存，未改变真实批改设置。');};}
function confirm(title,body,action,label='确认'){$('#confirm-title').textContent=title;$('#confirm-body').textContent=body;$('#confirm-yes .lg-content').textContent=label;confirmAction=action;$('#confirm-dialog').showModal();}
function dirty(){return $('#entry-content').value!==initial||$('#entry-expiry').value!==initialExpiry;}
function closeEntry(){if(dirty())confirm('放弃未保存的修改？','本次填写尚未保存。',()=>$('#entry-dialog').close(),'放弃修改');else $('#entry-dialog').close();}
function openEntry(record){current=record;initial=record?.content??'';initialExpiry=record?.expiry??'';const kind=record?.kind??section;const pending=record?.status==='candidate';$('#dialog-category').textContent=kind==='rules'?'个人规则':'长期记忆';$('#dialog-title').textContent=pending?'确认这条记忆':record?'编辑内容':kind==='rules'?'新增个人规则':'新增记忆';$('#content-label').textContent=pending?'拟保存的内容':'内容';$('#entry-content').value=initial;$('#entry-content').placeholder=kind==='rules'?'例如：教案先列教学目标，再列教学过程。':'例如：这学期重点改善课堂讨论参与度。';$('#entry-expiry').value=initialExpiry;$('#entry-meta').textContent=pending?'确认前，你可以先调整这段内容。':record?'当前'+(record.status==='active'?'已启用':'已停用')+' · 更新于'+record.updated:'保存后用于后续助手请求。';$('#entry-source').textContent='来源：'+(record?.source??'本人添加');$('#save-entry .lg-content').textContent=pending?'确认保存':record?'保存修改':'保存';$('#more-entry').hidden=!record;$('#more-menu').hidden=true;$('#more-entry').setAttribute('aria-expanded','false');$('#toggle-entry').textContent=pending?'暂不保存':record?.status==='disabled'?'启用这条记录':'停用这条记录';$('#history-panel').hidden=true;$('#entry-dialog').querySelector('details').open=pending;$('#entry-dialog').showModal();hydrate($('#entry-dialog'));}
$('#entry-form').onsubmit=e=>{e.preventDefault();const text=$('#entry-content').value.trim();if(!text){$('#entry-content').focus();return;}const pending=current?.status==='candidate';if(current){current.content=text;current.expiry=$('#entry-expiry').value;current.updated='刚刚';if(pending)current.status='active';}else records.push({id:Date.now(),kind:section,content:text,expiry:$('#entry-expiry').value,status:'active',updated:'刚刚',source:'本人添加'});$('#entry-dialog').close();renderSettings();toast(pending?'演示：记忆已确认保存。':'演示：已保存，未改动真实记录。');};
$('#close-entry').onclick=closeEntry;$('#entry-dialog').oncancel=e=>{e.preventDefault();closeEntry();};
$('#more-entry').onclick=()=>{$('#more-menu').hidden=!$('#more-menu').hidden;$('#more-entry').setAttribute('aria-expanded',String(!$('#more-menu').hidden));};
$('#history-entry').onclick=()=>{$('#history-panel').hidden=false;$('#history-panel').textContent='修改记录示例：今天保存当前内容。实际应用中将在这里查看历史版本和原始来源。';$('#more-menu').hidden=true;};
$('#toggle-entry').onclick=()=>{if(dirty()){toast('请先保存或取消当前修改。');return;}if(current.status==='candidate'){confirm('暂不保存这条记忆？','这条建议不会作为长期记忆使用。',()=>{current.status='deleted';$('#entry-dialog').close();renderSettings();toast('演示：已忽略这条建议。');},'暂不保存');return;}current.status=current.status==='active'?'disabled':'active';$('#entry-dialog').close();renderSettings();toast('演示：已'+(current.status==='active'?'启用':'停用')+'。');};
$('#delete-entry').onclick=()=>confirm('删除这条记录？','后续不再召回这条内容，原对话和历史版本仍保留。',()=>{current.status='deleted';$('#entry-dialog').close();renderSettings();toast('演示：记录已删除。');},'删除');
$('#confirm-cancel').onclick=()=>$('#confirm-dialog').close();$('#confirm-yes').onclick=()=>{$('#confirm-dialog').close();confirmAction?.();};
function scene(name){const chat=name==='chat';$('#settings-scene').hidden=chat;$('#chat-scene').hidden=!chat;$('#breadcrumb').textContent=chat?'工作台 / AI 助手':'我的设置 / AI 助手';$('#return-chat').hidden=chat;document.querySelectorAll('[data-scene]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.scene===name)));}
document.querySelectorAll('[data-scene]').forEach(b=>b.onclick=()=>scene(b.dataset.scene));$('#return-chat').onclick=()=>scene('chat');$('#sidebar-settings').onclick=()=>{section='rules';renderSettings();scene('settings');};
function collapse(value){$('#chat-sidebar').hidden=value;$('#expand-sidebar').hidden=!value;$('#chat-scene').classList.toggle('sidebar-collapsed',value);}
$('#collapse-sidebar').onclick=()=>collapse(true);$('#expand-sidebar').onclick=()=>collapse(false);
$('#phone-toggle').onclick=()=>{const enabled=$('#preview').classList.toggle('phone');$('#phone-toggle').setAttribute('aria-pressed',String(enabled));document.body.dataset.phone=String(enabled);};
$('#send-demo').onclick=()=>toast('这是入口位置原型，不发送消息或调用模型。');
$('.new-chat .lg-content').innerHTML=icon('plus')+'新对话';
renderSettings();hydrate();
window.addEventListener('beforeunload',()=>{for(const api of materials.values())api.destroy();});
