window.__ModuleLoader__.load({id: '@qingsong/assistant-ui', factory: require => ({
  inject: ['slots', 'locale', 'layout', 'uiWorkspace', 'workspaces', 'sessions', 'conversation', 'uiConversation', 'inputTriggers', 'remote.commands'],
  apply(ctx) {
    const React = require('react');
    const materialSource = 'qingsong-pool';
    const materialToken = id => '[[青松材料:' + id + ']]';
    const materialUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const connectionId = (window.name || '').replace(/^qingsong-assistant:/, '');
    const lessonSource="qingsong-lesson";
    const materialPattern = /\[\[青松材料:([0-9a-f-]{36})\]\]/gi;
    const openLessonPreview = id => {parent.postMessage({type:'qingsong:preview-lesson',referenceId:id,connectionId},location.origin);return true;};
    // The native renderer owns message structure; tokens remain intact in the model log.
    ctx.effect(()=>ctx.uiConversation.userText.register({id:lessonSource,order:5,match(text,from){
      const pattern=/\[\[青松教案:([0-9a-f-]{36})\]\]/gi;pattern.lastIndex=from;const found=pattern.exec(text);
      if(found&&materialUuid.test(found[1]))return {id:lessonSource,start:found.index,end:found.index+found[0].length,data:{referenceId:found[1]}};
    }}));
    ctx.effect(()=>ctx.uiConversation.userText.register({id:materialSource,order:6,match(text,from){
      materialPattern.lastIndex=from;const found=materialPattern.exec(text);
      if(found&&materialUuid.test(found[1]))return {id:materialSource,start:found.index,end:found.index+found[0].length,data:{referenceId:found[1]}};
    }}));
    function SentLessonReference({node}) {
      const [reference,setReference]=React.useState(null);
      React.useEffect(()=>{const controller=new AbortController();void requestJSON('./api/qingsong/lesson-references?id='+encodeURIComponent(node.data.referenceId),{signal:controller.signal}).then(value=>setReference(value.references[0])).catch(()=>{});return()=>controller.abort();},[node.data.referenceId]);
      if(!reference)return React.createElement('span',{className:'qs-sent-lesson-reference'},'正在读取教案引用…');
      const href='/?page=lesson-plan&preparationId='+encodeURIComponent(reference.preparationId)+'&documentId='+encodeURIComponent(reference.documentId);
      return React.createElement('a',{className:'qs-sent-lesson-reference',href,title:'打开对应教案'},reference.selection ? '“'+reference.selection.text.slice(0,100)+'” · 选中文字' : reference.title+' · 教案');
    }
    ctx.slots.inject('conversation.user.text.node',()=>ctx.slots.register({name:'conversation.user.text.node',key:lessonSource,priority:-100},props=>React.createElement(SentLessonReference,props)));
    function SentMaterialReference({node,sessionId}) {
      const [name,setName]=React.useState('已引用资料');
      React.useEffect(()=>{const controller=new AbortController();void requestJSON('./api/qingsong/material-reference-labels?sessionId='+encodeURIComponent(sessionId)+'&id='+encodeURIComponent(node.data.referenceId),{signal:controller.signal}).then(value=>{const reference=value.references?.find(item=>item.id===node.data.referenceId);if(reference)setName(reference.name);}).catch(()=>{});return()=>controller.abort();},[node.data.referenceId,sessionId]);
      return React.createElement('span',{className:'qs-sent-material-reference',title:name},'资料 · '+name);
    }
    ctx.slots.inject('conversation.user.text.node',()=>ctx.slots.register({name:'conversation.user.text.node',key:materialSource,priority:-100,inject:sessionId=>({sessionId})},props=>React.createElement(SentMaterialReference,props)));
    const handleLessonLink=event=>{
      const anchor=event.target.closest?.('a[href]');if(!anchor)return;
      let url;try{url=new URL(anchor.getAttribute('href'),location.origin);}catch{return;}
      if(url.origin!==location.origin||!['/','/api/assistant/official/'].includes(url.pathname)||url.searchParams.get('page')!=='lesson-plan')return;
      const preparationId=url.searchParams.get('preparationId'),documentId=url.searchParams.get('documentId');if(!materialUuid.test(preparationId??'')||(documentId&&!materialUuid.test(documentId)))return;
      event.preventDefault();event.stopPropagation();parent.postMessage({type:'qingsong:open-lesson',preparationId,documentId,connectionId},location.origin);
    };
    ctx.effect(()=>{document.addEventListener('click',handleLessonLink,true);return()=>document.removeEventListener('click',handleLessonLink,true);});
    const lessonToken=id=>"[[青松教案:"+id+"]]";
    const pendingReferences=new Map();
    const requestJSON = async (url, options = {}) => {
      const response = await fetch(url, {cache:'no-store', ...options});
      const value = await response.json();
      if (!response.ok) throw Error(value.message || '引用未能读取，原输入保留，请重试。');
      return value;
    };
    const lessonInsert = reference => ({source:lessonSource,ref:reference.id,label:reference.selection ? '“'+reference.selection.text.slice(0,60)+'”' : reference.title+' · 教案引用',appearance:'file',clipboardText:lessonToken(reference.id)});
    const createLesson = value => requestJSON('./api/qingsong/lesson-references',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(value)});
    const lessonCandidates = async (query, signal) => (await requestJSON('./api/qingsong/lesson-references?q='+encodeURIComponent(query),{signal})).items;
    const chooseLesson = async (sessionId, candidate, span, persist) => {
      const scope=ctx.sessions.scope(sessionId), input=scope&&ctx.conversation.input.for(scope);
      try {
        const {reference}=await createLesson({preparationId:candidate.preparationId,documentId:candidate.documentId});
        if(!input?.insertReference(lessonInsert(reference),span))throw Error('输入已变化，教案尚未加入，请重新选择。');
        persist?.();
      } catch(error) {input?.notify('error',error.message);}
    };
    ctx.effect(()=>ctx.inputTriggers.registerSource({
      name:lessonSource,trigger:'@',
      openReference:(_session,value)=>openLessonPreview(value.ref),
      candidates:async (_session,req)=>(await lessonCandidates(req.query,req.signal)).map(item=>({name:item.title+' '+item.documentId,label:item.title,description:'教案 · 当前稿',icon:'file',value:JSON.stringify(item)})),
      onPick:pick=>{void chooseLesson(pick.session.sessionId,JSON.parse(pick.candidate.value),pick.span);return 'handled';},
      codec:{clipboardText:lessonToken,serialize:async id=>{if(!materialUuid.test(id))throw Error('教案引用无效，请重新添加。');return lessonToken(id);}},
    }));
    function LessonReference({sessionId,inputActions,useInput}) {
      const occurrences=useInput(state=>state.occurrences), phase=useInput(state=>state.phase);
      const signature=occurrences.filter(item=>item.source===lessonSource).map(item=>item.ref).join(',');
      const [references,setReferences]=React.useState([]),[error,setError]=React.useState('');
      React.useEffect(()=>{
        setReferences([]);setError('');if(!signature)return;
        const controller=new AbortController();
        const check=()=>requestJSON('./api/qingsong/lesson-references?'+signature.split(',').map(id=>'id='+encodeURIComponent(id)).join('&'),{signal:controller.signal}).then(value=>{setReferences(value.references);setError('');}).catch(cause=>{if(!controller.signal.aborted)setError(cause.message);});
        void check();window.addEventListener('focus',check);window.addEventListener('qingsong:lesson-changed',check);
        return()=>{controller.abort();window.removeEventListener('focus',check);window.removeEventListener('qingsong:lesson-changed',check);};
      },[sessionId,signature]);
      const update=async reference=>{
        const old=occurrences.find(item=>item.source===lessonSource&&item.ref===reference.id);
        if(!old)return;
        // Occurrences use clipboard offsets; native insertion counts every reference chip as one character.
        const start=old.offset-occurrences.filter(item=>item.offset<old.offset).reduce((total,item)=>total+item.length-1,0);
        const span={start,end:start+1,draftRev:inputActions.captureInsertion().draftRev};
        try {
          const value=await createLesson({referenceId:reference.id});
          const scope=ctx.sessions.scope(sessionId);
          if(!scope||!ctx.conversation.input.for(scope).insertReference(lessonInsert(value.reference),span))throw Error('输入已变化，旧引用保留，请重新点击更新。');
          inputActions.persistDraft();setError('');
        } catch(cause){setError(cause.message);}
      };
      React.useEffect(()=>{
        const insert=()=>{const reference=pendingReferences.get(sessionId);if(!reference)return;const scope=ctx.sessions.scope(sessionId);const input=scope&&ctx.conversation.input.for(scope);if(input?.insertReference(lessonInsert(reference),inputActions.captureInsertion())){inputActions.persistDraft();pendingReferences.delete(sessionId);}else input?.notify("error","教案引用未能加入，原输入保留，请重新从教案添加。");};
        window.addEventListener("qingsong:add-lesson-reference",insert);insert();return()=>window.removeEventListener("qingsong:add-lesson-reference",insert);
      },[sessionId,inputActions]);
      return React.createElement('div',{className:'qs-lesson-updates'},references.filter(reference=>reference.selection).map(reference=>{const location=reference.selection.location;const where=location?.table?`表格第${location.table.row}行第${location.table.column}列`:location?.blocks?.length?`${location.blocks.length}个段落块`:'';return React.createElement('details',{key:reference.id,className:'qs-selection-quote',open:true},React.createElement('summary',null,'引用文本预览'),React.createElement('small',null,reference.title+' · '+(where?where+' · ':'')+'第 '+reference.revision+' 版'),React.createElement('blockquote',null,reference.selection.text),React.createElement('button',{type:'button',onClick:()=>openLessonPreview(reference.id)},'查看原文'));}),references.filter(reference=>reference.stale).map(reference=>React.createElement('button',{key:reference.id,type:'button',disabled:phase!=='plain',onClick:()=>void update(reference)},reference.title+'：更新引用')),error&&React.createElement('span',{role:'alert'},error));
    }
    ctx.slots.inject('conversation.input.dock',()=>ctx.slots.register({name:'conversation.input.dock',id:'qingsong-lesson-reference',priority:-101},props=>React.createElement(LessonReference,props)));
    function FailureNotice({node, sessionId, retry}) {
      const failure = retry ? node.data.current.failure : node.data;
      const [outcome, setOutcome] = React.useState('正在核对教案保存状态…');
      const [attempt, setAttempt] = React.useState(0);
      const [recovery,setRecovery]=React.useState(''),[recovering,setRecovering]=React.useState(false),[compactFailed,setCompactFailed]=React.useState(false);
      const overflow=globalThis.QingsongAssistantFailure.isOverflow(failure);
      const compact=async()=>{
        setRecovering(true);setRecovery('正在整理历史，原会话和教案保留…');
        try {const result=await ctx.remote.commands.execute(sessionId,'/compact',[]);if(!result?.ok||result.value?.result?.kind!=='success')throw Error('历史整理未能完成。');setRecovery('历史已整理。请核对教案和修改建议，再发送你的修改要求；本次没有自动重跑。');setCompactFailed(false);}catch{setRecovery('历史整理未完成。原会话和教案保留，可新建会话继续。');setCompactFailed(true);}finally{setRecovering(false);}
      };
      const newSession=()=>ctx.uiWorkspace.startSession();
      React.useEffect(() => {
        if (retry) return;
        const controller = new AbortController();
        setOutcome('正在核对教案保存状态…');
        fetch('./api/qingsong/preparation-outcome?sessionId=' + encodeURIComponent(sessionId), {signal:AbortSignal.any([controller.signal,AbortSignal.timeout(10000)]), cache:'no-store'})
          .then(async response => {if (!response.ok) throw Error(); return response.json();})
          .then(value => {if (!controller.signal.aborted) {setOutcome(globalThis.QingsongAssistantFailure.saved(value,failure));}})
          .catch(() => {if (!controller.signal.aborted) setOutcome('保存状态尚未核对成功。请检查教案和修改建议，避免重复提交。');});
        return () => controller.abort();
      }, [sessionId, node.key, attempt, retry]);
      const current = retry ? node.data.current : null;
      return React.createElement('div', {className:'qs-failure-notice',role:'status'},
        React.createElement('p',null,globalThis.QingsongAssistantFailure.reason(failure)),
        retry ? React.createElement('p',null,current.retryState === 'scheduled' ? '系统正在按既定次数重试当前模型请求，请稍候；不会重发整轮操作。' : current.retryState === 'cancelled' ? '本次模型重试已取消。' : '已尝试重新连接模型服务。') : React.createElement('p',null,outcome),
        overflow&&!retry&&React.createElement('div',{className:'qs-failure-recovery'},React.createElement('button',{type:'button',disabled:recovering,onClick:()=>void compact()},recovering?'处理中…':'整理历史后继续'),compactFailed&&React.createElement('button',{type:'button',disabled:recovering,onClick:newSession},'新建会话继续'),recovery&&React.createElement('p',{role:'status'},recovery)),
        !retry && React.createElement('button',{type:'button',onClick:()=>setAttempt(value=>value+1)},'重新核对保存状态'),
        React.createElement('details',null,React.createElement('summary',null,'技术详情'),React.createElement('pre',null,JSON.stringify({code:failure?.code,message:failure?.message,...(retry ? {delayMs:Math.round(current.delayMs),retry:current.retry,maxRetries:current.maxRetries} : {})},null,2))));
    }
    for (const [key,retry] of [['model-retry',true],['turn-error',false]]) {
      ctx.slots.inject('conversation.chat.node',()=>ctx.slots.register({name:'conversation.chat.node',key,priority:-100},props=>React.createElement(FailureNotice,{...props,retry})));
    }
    ctx.effect(() => ctx.inputTriggers.registerSource({
      name: materialSource, trigger: '@',
      candidates:async (_session,req)=>{const value=await requestJSON('/api/material-pool/items?limit=50&q='+encodeURIComponent(req.query),{signal:req.signal});return value.items.map(item=>({name:item.originalName+' '+item.id,label:item.originalName,description:'材料池',icon:'file',value:item.id}));},
      onPick:pick=>{
        const scope=ctx.sessions.scope(pick.session.sessionId),input=scope&&ctx.conversation.input.for(scope);
        void requestJSON('./api/qingsong/materials/references',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId:pick.session.sessionId,requestId:crypto.randomUUID(),itemIds:[pick.candidate.value]})})
          .then(value=>{const ref=value.references[0];if(!input?.insertReference({source:materialSource,ref:ref.id,label:'材料池 · '+ref.name,appearance:'file',clipboardText:materialToken(ref.id)},pick.span))throw Error('输入已变化，材料尚未加入，请重新选择。');})
          .catch(error=>input?.notify('error',error.message));
        return 'handled';
      },
      codec: {clipboardText: materialToken, serialize: async id => {
        if (!materialUuid.test(id)) throw Error('资料引用无效，请从材料池重新选择。');
        return materialToken(id);
      }},
    }));
    function MaterialsMenu({sessionId,inputActions,useInput,addFiles,insertReference}) {
      const phase = useInput(state => state.phase);
      const locked = phase !== 'plain';
      const [open,setOpen] = React.useState(false), [error,setError] = React.useState('');
      const [picking,setPicking] = React.useState(false);
      const [lessons,setLessons]=React.useState(null),[lessonQuery,setLessonQuery]=React.useState(''),[lessonLoading,setLessonLoading]=React.useState(false);
      React.useEffect(()=>{
        if(lessons===null)return;
        const controller=new AbortController();setLessonLoading(true);
        const timer=setTimeout(()=>void lessonCandidates(lessonQuery,controller.signal).then(setLessons).catch(cause=>{if(!controller.signal.aborted)setError(cause.message);}).finally(()=>{if(!controller.signal.aborted)setLessonLoading(false);}),150);
        return()=>{clearTimeout(timer);controller.abort();};
      },[lessons===null,lessonQuery]);
      const pending = React.useRef(null), fileInput = React.useRef(null), menu = React.useRef(null);
      const inputRef=React.useRef({inputActions,insertReference});inputRef.current={inputActions,insertReference};
      React.useEffect(()=>{
        const onKeyDown=event=>{
          if(event.key!=='@'||event.isComposing||event.altKey||event.ctrlKey||event.metaKey||phase!=='plain'||!event.target?.closest?.('[data-composer-input]'))return;
          const insertion=inputActions.captureInsertion();
          if(insertion.start!==insertion.end)return;
          const selection=window.getSelection();
          const node=selection?.anchorNode;
          if(!node||node.nodeType!==Node.TEXT_NODE||selection.anchorOffset!==selection.focusOffset)return;
          const before=node.textContent?.slice(0,selection.anchorOffset)??'';
          if(!/\S$/u.test(before)||!/[\p{L}\p{N}_]$/u.test(before))return;
          const start=selection.anchorOffset;
          event.preventDefault();
          if(!inputActions.insertText('@',insertion))return;
          const caret=inputActions.captureInsertion();
          const scope=ctx.sessions.scope(sessionId);
          const triggers=scope&&ctx.inputTriggers.sessionOf(scope);
          if(triggers)triggers.toggleSource(materialSource,{trigger:'@',query:'',quoted:false,position:'inline',span:{start:caret.start-1,end:caret.start,draftRev:caret.draftRev}});
          inputActions.persistDraft();
        };
        document.addEventListener('keydown',onKeyDown,true);
        return()=>document.removeEventListener('keydown',onKeyDown,true);
      },[sessionId,inputActions,phase]);
      const icon = path => React.createElement('svg',{viewBox:'0 0 24 24',width:18,height:18,fill:'none',stroke:'currentColor',strokeWidth:1.8,'aria-hidden':true},React.createElement('path',{d:path}));
      React.useEffect(() => {
        const outside = event => {if(!menu.current?.contains(event.target)){setOpen(false);setLessons(null);}};
        document.addEventListener('pointerdown',outside);
        return () => document.removeEventListener('pointerdown',outside);
      },[]);
      React.useEffect(() => {
        const receive = event => {
          const data=event.data, request=pending.current;
          if(event.origin!==location.origin || event.source!==parent || !request || data?.connectionId!==connectionId || data?.requestId!==request.id || data?.sessionId!==sessionId || !['qingsong:materials-opened','qingsong:materials-picked','qingsong:materials-cancelled'].includes(data?.type))return;
          if(data.type==='qingsong:materials-opened'){clearTimeout(request.timer);request.timer=null;return;}
          clearTimeout(request.timer); pending.current=null;setPicking(false);
          if(data.type==='qingsong:materials-cancelled')return;
          if(!Array.isArray(data.references)||!data.references.length||data.references.length>20||data.references.some(ref=>!materialUuid.test(ref?.id)||typeof ref.name!=='string')) {setError('资料引用未添加，请从材料池重新选择。');return;}
          let span=request.span;
          for(const ref of data.references) {
            if(!inputRef.current.insertReference({source:materialSource,ref:ref.id,label:'材料池 · '+ref.name.slice(0,160),appearance:'file',clipboardText:materialToken(ref.id)},span)) {
              setError('输入内容已变化，部分资料可能未添加。请核对输入区后重新选择。');return;
            }
            span=inputRef.current.inputActions.captureInsertion();
          }
          inputRef.current.inputActions.persistDraft();
        };
        window.addEventListener('message',receive);
        return()=>{window.removeEventListener('message',receive);if(pending.current){clearTimeout(pending.current.timer);parent.postMessage({type:'qingsong:materials-cancelled',requestId:pending.current.id,sessionId,connectionId},location.origin);}pending.current=null;};
      },[sessionId]);
      const pickPool=()=>{
        setOpen(false);setError('');setPicking(true);
        const id=crypto.randomUUID(), span=inputActions.captureInsertion();
        const timer=setTimeout(()=>{if(pending.current?.id===id){pending.current=null;setPicking(false);parent.postMessage({type:'qingsong:materials-cancelled',requestId:id,sessionId,connectionId},location.origin);setError('材料选择面板未能打开，输入内容仍保留，请重试。');}},10000);
        pending.current={id,span,timer};
        parent.postMessage({type:'qingsong:pick-materials',requestId:id,sessionId,connectionId},location.origin);
      };
      return React.createElement('div',{className:'qs-materials-menu',ref:menu,onKeyDown:event=>{if(event.key==='Escape'){setOpen(false);setLessons(null);setError('');}}},
        React.createElement('button',{type:'button',className:'qs-materials-button','aria-label':'添加附件或材料池资料','aria-expanded':open,'aria-haspopup':'menu',disabled:locked||picking,onClick:()=>{setError('');setOpen(value=>!value);}},icon('M12 5v14M5 12h14')),
        React.createElement('input',{type:'file',multiple:true,hidden:true,ref:fileInput,accept:'.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.tsv,.txt,.md,.markdown,.json,.yaml,.yml,.png,.jpg,.jpeg,.webp,.gif',onChange:event=>{
          const files=Array.from(event.target.files??[]);event.target.value='';setError('');
          if(files.length>20){setError('一次最多选择20个附件，尚未添加，请分批选择。');return;}
          try{addFiles(files,inputActions);}catch(error){setError(error.message||'附件未添加，原对话仍保留，请重试。');}
        }}),
        open&&React.createElement('div',{className:'qs-materials-options',role:'menu'},
          React.createElement('button',{type:'button',role:'menuitem',onClick:()=>{setOpen(false);fileInput.current.click();}},icon('M21 11.5 12 20.5a6 6 0 0 1-8.5-8.5l9-9a4 4 0 0 1 5.7 5.7l-9 9a2 2 0 0 1-2.8-2.8L15 6.5'),'上传文件'),
          React.createElement('button',{type:'button',role:'menuitem',onClick:()=>{setOpen(false);setLessonQuery('');setLessons([]);}},icon('M4 3h12l4 4v14H4Z'),'引用教案'),
          React.createElement('button',{type:'button',role:'menuitem',onClick:pickPool},icon('M3 7h7l2-3h9v16H3Z'),'从材料池选择')),
        lessons!==null&&React.createElement('div',{className:'qs-lesson-picker',role:'dialog','aria-label':'引用教案'},
          React.createElement('div',null,React.createElement('strong',null,'引用教案'),React.createElement('button',{type:'button','aria-label':'关闭教案选择',onClick:()=>setLessons(null)},'关闭')),
          React.createElement('input',{autoFocus:true,'aria-label':'搜索教案',placeholder:'搜索教案名称',value:lessonQuery,onChange:event=>setLessonQuery(event.target.value)}),
          lessonLoading?React.createElement('p',{role:'status'},'正在读取教案…'):lessons.length?lessons.map(item=>React.createElement('button',{type:'button',key:item.documentId,onClick:()=>{const span=inputActions.captureInsertion();setLessons(null);void chooseLesson(sessionId,item,span,()=>inputActions.persistDraft());}},item.title+' · 当前稿')):React.createElement('p',null,'没有找到教案，可修改关键词。')),
        error&&React.createElement('span',{className:'qs-materials-error',role:'alert'},React.createElement('span',null,error),React.createElement('button',{type:'button','aria-label':'关闭材料提示',onClick:()=>setError('')},icon('M6 6l12 12M18 6 6 18'))));
    }
    ctx.slots.inject('conversation.input.left',()=>ctx.slots.register({
      name:'conversation.input.left',id:'qingsong-materials',priority:-100,
      inject:sessionId=>({
        addFiles:(files,actions)=>{
          const drafts=ctx.conversation.createDrafts(sessionId,files);
          if(!actions.addAttachments(drafts.map(draft=>draft.id))){ctx.conversation.releaseDraftAttachments(drafts);throw Error('当前无法添加附件，输入内容仍保留，请稍后重试。');}
        },
        insertReference:(reference,span)=>{
          const scope=ctx.sessions.scope(sessionId);
          return scope?ctx.conversation.input.for(scope).insertReference(reference,span):false;
        },
      }),
    },props=>React.createElement(MaterialsMenu,props)));
    // Native rc.3 drag clamps to 264px; keep its open/close state and use a scoped slot for 180px.
    function SidebarResize() {
      const ref=React.useRef(null);
      const [width,setWidth]=React.useState(180);
      React.useEffect(()=>{const frame=ref.current.closest('.pI_x6G_frame');frame.style.setProperty('--qs-sidebar-width',width+'px');return()=>frame.style.removeProperty('--qs-sidebar-width');},[width]);
      const clamp=value=>Math.max(150,Math.min(320,ref.current.closest('.pI_x6G_frame').clientWidth-180,value));
      return React.createElement('div',{ref,className:'qs-sidebar-resize',role:'separator',tabIndex:0,'aria-label':'调整会话侧栏宽度','aria-orientation':'vertical','aria-valuemin':150,'aria-valuemax':320,'aria-valuenow':width,
        onKeyDown:e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();setWidth(clamp(width+(e.key==='ArrowLeft'?-10:10)));}},
        onPointerDown:e=>{e.currentTarget.setPointerCapture(e.pointerId);e.currentTarget.dataset.startX=e.clientX;e.currentTarget.dataset.startWidth=width;},
        onPointerMove:e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))setWidth(clamp(Number(e.currentTarget.dataset.startWidth)+e.clientX-Number(e.currentTarget.dataset.startX)));},
        onPointerUp:e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}});
    }
    ctx.slots.inject('shell.overlay',()=>ctx.slots.register({name:'shell.overlay',id:'qingsong-sidebar-resize',priority:-90},()=>React.createElement(SidebarResize)));
    function WorkspaceName({open, onCancel}) {
      const [title, setTitle] = React.useState('');
      const [busy, setBusy] = React.useState(false);
      const [error, setError] = React.useState('');
      const requestId = React.useRef(crypto.randomUUID());
      const dialog = React.useRef(null);
      React.useEffect(() => { if (open) { setTitle(''); setError(''); requestId.current = crypto.randomUUID(); dialog.current.showModal(); return () => dialog.current?.close(); } }, [open]);
      const submit = async () => {
        if (busy || !title.trim()) return; setBusy(true); setError('');
        try {
          const response = await fetch('./api/qingsong/workspace', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({title, requestId: requestId.current})});
          const result = await response.json(); if (!response.ok) throw Error(result.message);
          await ctx.uiWorkspace.openWorkspace(result.workspace.workspaceId, undefined, {agentPreset: 'qingsong'});
          onCancel();
        } catch (e) { setError(e.message || '连接中断，请重试；已有会话保留。'); } finally { setBusy(false); }
      };
      return React.createElement('dialog', {ref: dialog, className: 'qs-workspace-dialog', onCancel: event => {event.preventDefault(); if (!busy) onCancel();}},
        React.createElement('div', null,
          React.createElement('h2', null, '新增工作区'),
          React.createElement('label', null, '名称', React.createElement('input', {autoFocus: true, value: title, maxLength: 40, placeholder: '例如：备课、一班教学', onChange: event => {setTitle(event.target.value); requestId.current = crypto.randomUUID();}, onKeyDown: event => {if (event.key === 'Enter' && !event.nativeEvent.isComposing) {event.preventDefault(); void submit();}}, disabled: busy})),
          error && React.createElement('p', {role: 'alert'}, error),
          React.createElement('div', {className: 'qs-workspace-actions'}, React.createElement('button', {type: 'button', disabled: busy, onClick: onCancel}, '取消'), React.createElement('button', {type: 'button', className: 'qs-workspace-create', onClick: submit, disabled: busy || !title.trim()}, busy ? '正在创建…' : '创建'))));
    }
    ctx.slots.inject('sidebar.workspaces.directoryFlow', () => ctx.slots.register({name: 'sidebar.workspaces.directoryFlow', id: 'qingsong-workspace-name', priority: -100}, props => React.createElement(WorkspaceName, props)));

    ctx.slots.inject('sidebar.footer.action',()=>ctx.slots.register({name:'sidebar.footer.action',id:'qingsong-settings',priority:-100},()=>React.createElement('button',{type:'button',className:'qs-sidebar-settings',title:'会话设置','aria-label':'会话设置',onClick:()=>parent.postMessage({type:'qingsong:settings'},location.origin)},React.createElement('svg',{viewBox:'0 0 24 24',width:20,height:20,fill:'none',stroke:'currentColor',strokeWidth:1.7,'aria-hidden':true},React.createElement('path',{d:'M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915'}),React.createElement('circle',{cx:12,cy:12,r:3})))));

    ctx.slots.inject('sidebar.brand.mark', () => ctx.slots.register({name: 'sidebar.brand.mark', id: 'qingsong-logo', priority: -100}, () => React.createElement('span', {className: 'qs-brand-mark', role: 'img', 'aria-label': '青松'})));
    ctx.slots.inject('sidebar.brand.name', () => ctx.slots.register({name: 'sidebar.brand.name', id: 'qingsong-name', priority: -100}, () => React.createElement('span', null, '青松')));
    ctx.slots.inject('shell.overlay', () => ctx.slots.register({name: 'shell.overlay', id: 'qingsong-session-button', priority: -100}, () => React.createElement('button', {className: 'qs-session-button', type: 'button', onClick: () => ctx.layout.toggleSidebar(), 'aria-label': '打开会话侧栏'}, React.createElement('span', {className: 'qs-brand-mark', 'aria-hidden': true}), '会话')));

    ctx.slots.inject('conversation.hero.brand.mark', () => ctx.slots.register({name: 'conversation.hero.brand.mark', id: 'qingsong-welcome', priority: -100}, () => React.createElement('div', {className: 'qs-welcome'}, React.createElement('div', null, '今天想先处理什么？'), React.createElement('small', null, '课表 · 名单 · 课堂记录'))));
    for (const name of ['conversation.hero.workspace', 'conversation.hero.agentPreset', 'conversation.hero.options']) {
      ctx.slots.inject(name, () => ctx.slots.register({name, id: 'qingsong', priority: -100}, () => null));
    }
    ctx.effect(() => ctx.locale.addLanguage({id: 'zh-CN-x-qingsong', label: '简体中文（青松）', fallback: 'zh'}));
    ctx.effect(() => ctx.locale.register('conversation', 'zh-CN-x-qingsong', {'placeholder.hero': '问问课表、班级名单或课堂记录…', 'placeholder.default': '继续问问教学上的事…'}));
    // Parent chooses an entry; native catalogs, navigation and unsent drafts remain DSH-owned.
    ctx.effect(() => {
      let current;
      const cancel = () => {current?.controller.abort(); current = undefined;};
      const receive = async event => {
        const data = event.data;
        if (event.origin !== location.origin || event.source !== parent || data?.connectionId !== connectionId) return;
        if (data.type === 'qingsong:lesson-changed') {window.dispatchEvent(new Event('qingsong:lesson-changed'));return;}
        if (data.type === 'qingsong:cancel-context') {if (current?.requestId === data.requestId) cancel(); return;}
        if(data.type==='qingsong:prepare-context'){cancel();current={requestId:data.requestId,controller:new AbortController()};return;}
        if (data.type !== 'qingsong:open-context') return;
        cancel();
        // Invalidates a previous SDK workspace open; a specific session never falls back to a blank one.
        ctx.layout.beginNavigation();
        const navigation = {requestId:data.requestId,controller:new AbortController()}; current = navigation;
        try {
          const target = await globalThis.QingsongAssistantNavigation.openContext(ctx, data.target, {
            signal:navigation.controller.signal,
            onStage:stage => parent.postMessage({type:'qingsong:context-progress',connectionId,requestId:data.requestId,stage},location.origin),
            onTiming:timing => parent.postMessage({type:'qingsong:context-timing',connectionId,requestId:data.requestId,...timing},location.origin),
          });
          if (current === navigation) {
            if(data.target.reference&&target.sessionId){pendingReferences.set(target.sessionId,data.target.reference);window.dispatchEvent(new Event("qingsong:add-lesson-reference"));}
          }
          if (current === navigation) parent.postMessage({type:'qingsong:context-opened',connectionId,requestId:data.requestId,target},location.origin);
        } catch (error) {
          if (current !== navigation || navigation.controller.signal.aborted) return;
          const stage = error.stage ?? 'session-navigation';
          console.warn('[青松助手] 打开目标失败', {requestId:data.requestId,stage,errorName:error.name});
          const messages = {
            'workspace-directory':'工作区目录尚未同步，', 'session-directory':'教案会话目录未能同步，',
            'session-content':'教案会话未能读取，', 'session-navigation':'教案会话未能打开，',
            'workspace-navigation':'工作区未能打开，', 'draft':'备课要求未能放入输入框，',
          };
          parent.postMessage({type:'qingsong:context-opened',connectionId,requestId:data.requestId,stage,error:(messages[stage]??'助手未能打开，')+'教案和原会话保留，请重试。'},location.origin);
        } finally {if (current === navigation) {current = undefined;}}
      };
      window.addEventListener('message',receive);
      return () => {cancel(); window.removeEventListener('message',receive);};
    });
    // Observe native stores; a failed initial pull is not an endless loading state.
    ctx.effect(() => {
      const frameName=window.name||'';
      const connectionId=frameName.startsWith('qingsong-assistant:')?frameName.slice('qingsong-assistant:'.length):new URLSearchParams(location.search).get('connection')??'';
      const started=performance.now();let disposed=false,last='';
      let offWork=()=>{},offSessions=()=>{};
      const check=(force=false)=>{
        if(disposed)return;
        const work=ctx.workspaces.list.getSnapshot(),sessions=ctx.sessions.list.getSnapshot();
        const ready=work.phase==='ready'&&sessions.phase==='ready';
        const failed=work.state==='error'||(!ready&&sessions.state==='error');
        const phase=failed?'error':ready&&work.state==='loading'?'reconnecting':ready?'ready':'catalogs';
        const pending=work.phase!=='ready'||work.state==='error'||(ready&&work.state==='loading')?'workspace':'sessions';
        const signature=phase+':'+pending;if(!force&&last===signature)return;last=signature;
        const message={type:'qingsong:connection',connectionId,phase,pending,durationMs:Math.round(performance.now()-started)};
        parent.postMessage(message,location.origin);
        if(ready)parent.postMessage({type:'qingsong:ready',connectionId},location.origin);
      };
      let offSelectedSession=()=>{};
      const probe=event=>{if(event.origin===location.origin&&event.source===parent&&event.data?.type==='qingsong:probe'&&event.data.connectionId===connectionId)check(true);};
      window.addEventListener('message',probe);
      try{
        offWork=ctx.workspaces.list.subscribe(()=>check());
        offSessions=ctx.sessions.list.subscribe(()=>check());
        check();
      }
      catch{parent.postMessage({type:'qingsong:connection',connectionId,phase:'error',pending:'initialization'},location.origin);}
      try{
        let lastSessionPhase='';
        offSelectedSession=window.QingsongAssistantNavigation.observeSelectedSession(ctx, state=>{
          if(disposed)return;
          if(state.phase!==lastSessionPhase){
            lastSessionPhase=state.phase;
            console.info('[青松助手] 当前会话内容载入',{stage:'session-content',phase:state.phase,durationMs:state.durationMs});
          }
          parent.postMessage({type:'qingsong:session-load',connectionId,...state},location.origin);
        });
      }catch{parent.postMessage({type:'qingsong:session-load',connectionId,phase:'error',durationMs:0},location.origin);}
      return()=>{disposed=true;offWork();offSessions();offSelectedSession();window.removeEventListener('message',probe);};
    });
  },
})});
