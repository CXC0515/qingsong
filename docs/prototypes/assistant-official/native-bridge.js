// Isolated prototype bridge: delegates actions to official controls, never owns chat state.
const scan=()=>{
 const sidebar=document.querySelector('[data-slot="sidebar"]');
 if(sidebar){sidebar.parentElement.classList.add('qs-native-sidebar');sidebar.parentElement.parentElement.classList.add('qs-native-frame');}
 const hero=document.querySelector('[data-slot="conversation.hero.brand.mark"]');if(hero)hero.parentElement.classList.add('qs-native-irrelevant');
 for(const element of document.querySelectorAll('div,span'))if(!element.children.length){if(element.textContent==='探索未至之境')element.textContent='今天想先处理什么？';else if(element.textContent==='预览版')element.textContent='课表 · 名单 · 课堂记录';}
 const panels=document.querySelector('[aria-label="全局面板"]');if(panels)panels.classList.add('qs-native-irrelevant');
 const main=document.querySelector('[data-slot="main"]');if(main)main.parentElement.classList.add('qs-native-main');
 const header=document.querySelector('[data-slot="conversation.header"]');if(header)header.classList.add('qs-native-irrelevant');
 const card=document.querySelector('[data-slot="conversation.input.attachments"]');if(card)card.parentElement.classList.add('qs-native-composer');
 for(const button of document.querySelectorAll('button')){
  const label=button.getAttribute('aria-label')||'',text=button.textContent?.trim();
  if(label.startsWith('上下文已用')||/^用量\s*\d/.test(text??'')||/^\d+\s*轮\s*\d+\s*步/.test(text??''))button.classList.add('qs-native-irrelevant');
  if(label==='选择工作区'||label.startsWith('访问模式')||label==='添加文件或调用指令'||text==='标准模式')button.classList.add('qs-native-irrelevant');
 }
 for(const element of document.querySelectorAll('[role="textbox"]'))if(element.getAttribute('aria-label')?.match(/构建|创建任务/))element.setAttribute('aria-label','向教学助手提问');
 for(const element of document.querySelectorAll('[aria-placeholder]'))if(element.getAttribute('aria-placeholder')?.match(/构建|创建任务/))element.setAttribute('aria-placeholder','问课表、查名单，或聊聊教学安排…');
 for(const element of document.querySelectorAll('[aria-hidden="true"]'))if(!element.children.length&&element.textContent?.match(/^(描述你想要构建的内容|发消息或创建任务)/))element.textContent='问课表、查名单，或聊聊教学安排…';
};
window.addEventListener('message',event=>{
 if(event.origin!==location.origin||event.source!==parent||event.data?.type!=='qingsong-prototype')return;
 if(event.data.action==='history'){
  document.documentElement.classList.toggle('qs-history-visible');
  const button=document.querySelector('button[aria-label="打开侧边栏"],button[aria-label="收起侧边栏"]');button?.click();
 }else if(event.data.action==='new'){
  document.querySelector('button[aria-label="新建会话"]')?.click();document.documentElement.classList.remove('qs-history-visible');
 }
});
window.addEventListener('DOMContentLoaded',()=>{scan();new MutationObserver(scan).observe(document.body,{childList:true,subtree:true});});
