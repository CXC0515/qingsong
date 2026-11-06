window.__ModuleLoader__.load({id: '@qingsong/assistant-ui', factory: require => ({
  inject: ['slots', 'locale', 'layout', 'uiWorkspace', 'workspaces', 'sessions', 'conversation', 'inputTriggers', 'remote.commands'],
  apply(ctx) {
    const React = require('react');
    const materialSource = 'qingsong-pool';
    const materialToken = id => '[[青松材料:' + id + ']]';
    const materialUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const connectionId = (window.name || '').replace(/^qingsong-assistant:/, '');
    let hostTarget = {}, hostOpening = false, selectionVersion = 0;
    const guardListeners = new Set();
    let guard = null;
    const showGuard = value => {guard=value;guardListeners.forEach(fn=>fn());};
    const selectedSession = () => Object.values(ctx.sessions.list.getSnapshot().byId).find(row => (row.retainedBy.mainView??0)>0)?.id;
    function AssociationGuard() {
      const value=React.useSyncExternalStore(fn=>{guardListeners.add(fn);return()=>guardListeners.delete(fn);},()=>guard);
      const dialog=React.useRef(null);
      React.useEffect(()=>{if(value)dialog.current?.showModal();else dialog.current?.close();},[value]);
      return value && React.createElement('dialog',{ref:dialog,className:'qs-association-guard',onCancel:event=>event.preventDefault(),'aria-label':'核对教案关联'},React.createElement('div',{role:value.error?'alert':'status'},
        React.createElement('p',null,value.error||'正在核对会话与教案关联…'),
        value.error&&React.createElement('button',{onClick:()=>void reconcileSelection(value.sessionId)},'重新核对'),
        value.error&&hostTarget.sessionId&&React.createElement('button',{onClick:()=>{selectionVersion++;ctx.uiWorkspace.openSession(hostTarget.sessionId);showGuard(null);}},'返回原会话')));
    }
    ctx.slots.inject('shell.overlay',()=>ctx.slots.register({name:'shell.overlay',id:'qingsong-association-guard',priority:-110},()=>React.createElement(AssociationGuard)));
    async function reconcileSelection(sessionId) {
      const version=++selectionVersion, context=hostTarget;
      if(hostOpening||!sessionId||sessionId===context.sessionId) {showGuard(null);return;}
      showGuard({sessionId});
      try {
        const response=await fetch('./api/qingsong/preparation-selection',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId,...(context.preparationId?{preparationId:context.preparationId,documentId:context.documentId}:{})}),signal:AbortSignal.timeout(15000)});
        if(!response.ok)throw Error('教案关联未能核对，原内容保留，请重试。');
        const {target}=await response.json();
        if(version!==selectionVersion||selectedSession()!==sessionId||hostOpening)return;
        if(context.preparationId&&!target.bound)throw Error('这条旧会话未关联教案，未改动原对话。请返回原会话，或从教案新建会话。');
        const requestId=crypto.randomUUID();
        await new Promise((resolve,reject)=>{
          const finish=error=>{clearTimeout(timer);window.removeEventListener('message',receive);error?reject(Error(error)):resolve();};
          const receive=event=>{const data=event.data;if(event.origin===location.origin&&event.source===parent&&data?.connectionId===connectionId&&data?.type==='qingsong:selection-opened'&&data?.requestId===requestId)finish(data.error);};
          const timer=setTimeout(()=>finish('教案页面未能同步，原内容保留，请重试或返回原会话。'),20000);
          window.addEventListener('message',receive);
          parent.postMessage({type:'qingsong:native-selection',connectionId,requestId,target},location.origin);
        });
        if(version!==selectionVersion||hostOpening)return;
        hostTarget=target.bound?target:{workspaceId:context.workspaceId,sessionId};
        window.dispatchEvent(new CustomEvent('qingsong:association-checked',{detail:{sessionId}}));
        showGuard(null);
      } catch(error) {if(version===selectionVersion&&!hostOpening)showGuard({sessionId,error:error.message});}
    }
    ctx.effect(()=>{
      let previous;
      return ctx.sessions.list.subscribe(()=>{
        const sessionId=selectedSession();
        if(sessionId===previous)return;
        previous=sessionId;
        if(!hostOpening)void reconcileSelection(sessionId);
      });
    });
    // Association is shell context, never part of the shared attachment/composer toolbar.
    ctx.effect(() => {
      let previous, controller, version=0;
      const publish=association=>parent.postMessage({type:'qingsong:session-association',connectionId,...association},location.origin);
      const refresh=force=>{
        const sessionId=selectedSession();
        if(!force&&sessionId===previous)return;
        previous=sessionId;const current=++version;controller?.abort();
        publish({sessionId,bound:false});
        if(!sessionId)return;
        controller=new AbortController();const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(10000)]);
        fetch('./api/qingsong/preparation-outcome?sessionId='+encodeURIComponent(sessionId),{signal,cache:'no-store'})
          .then(async response=>{if(!response.ok)throw Error();return response.json();})
          .then(value=>{if(current===version&&selectedSession()===sessionId&&!signal.aborted)publish({sessionId,bound:value.bound===true,...(value.bound?{title:value.title,preparationId:value.preparationId,documentId:value.documentId}:{})});})
          .catch(()=>{});
      };
      const checked=event=>{if(event.detail?.sessionId===selectedSession())refresh(true);};
      const dispose=ctx.sessions.list.subscribe(()=>refresh(false));
      window.addEventListener('qingsong:association-checked',checked);refresh(false);
      return()=>{version++;controller?.abort();dispose();window.removeEventListener('qingsong:association-checked',checked);};
    });
    function SelectionQuote({sessionId}) {
      const [value,setValue]=React.useState(null),[error,setError]=React.useState(''),[busy,setBusy]=React.useState(false);
      React.useEffect(()=>{
        let alive=true,version=0;const controller=new AbortController();setValue(null);setError('');
        const refresh=async()=>{
          const current=++version;
          try {const r=await fetch('./api/qingsong/preparation-outcome?sessionId='+encodeURIComponent(sessionId),{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(10000)])});if(!r.ok)throw Error();const data=await r.json();if(alive&&current===version){setValue(data.bound&&data.selection?data:null);setError('');}}catch{if(alive)setError('引用状态未能核对，请稍后重试或重新选择。');}
        };
        const checked=event=>{if(event.detail?.sessionId===sessionId)void refresh();};
        window.addEventListener('qingsong:association-checked',checked);void refresh();
        const timer=setInterval(()=>{if(!document.hidden)void refresh();},5000);
        return()=>{alive=false;controller.abort();clearInterval(timer);window.removeEventListener('qingsong:association-checked',checked);};
      },[sessionId]);
      if(!value)return error?React.createElement('span',{className:'qs-selection-quote-error',role:'status'},error):null;
      const selection=value.selection,location=selection.location;
      const remove=async()=>{
        setBusy(true);setError('');
        try {const r=await fetch('./api/qingsong/preparation-target',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:'preparation',sessionId,preparationId:value.preparationId,documentId:value.documentId,revision:value.revision})});if(!r.ok)throw Error();if(hostTarget.sessionId===sessionId)hostTarget={...hostTarget,selection:undefined};setValue(null);}catch{setError('引用尚未移除，原输入保留，请重试。');}finally{setBusy(false);}
      };
      const position=location?.table?'表格第'+location.table.row+'行、第'+location.table.column+'列':location?.blocks?.length?location.blocks.map((block,index)=>'选区'+(index+1)+' · 段落内字符'+(block.from+1)+'–'+block.to).join('；'):'已选 '+selection.blockIds.length+' 个内容块';
      return React.createElement('div',{className:'qs-selection-quote',role:'group','aria-label':'引用的教案内容'},
        React.createElement('details',null,React.createElement('summary',null,'已引用：'+value.title+' · 第'+selection.revision+'版'),
          React.createElement('small',null,position),React.createElement('blockquote',null,selection.text)),
        selection.stale&&React.createElement('p',{role:'status'},'正文版本已变化，此引用已失效，请重新选择。'),
        error&&React.createElement('p',{role:'alert'},error),
        React.createElement('button',{type:'button',disabled:busy,onClick:()=>void remove(),'aria-label':'移除教案引用'},busy?'移除中…':'移除'));
    }
    ctx.slots.inject('conversation.input.dock',()=>ctx.slots.register({name:'conversation.input.dock',id:'qingsong-selection-quote',priority:-100},props=>React.createElement(SelectionQuote,props)));
    function FailureNotice({node, sessionId, retry}) {
      const failure = retry ? node.data.current.failure : node.data;
      const [outcome, setOutcome] = React.useState('正在核对教案保存状态…');
      const [attempt, setAttempt] = React.useState(0);
      const [savedValue,setSavedValue]=React.useState(null),[recovery,setRecovery]=React.useState(''),[recovering,setRecovering]=React.useState(false),[compactFailed,setCompactFailed]=React.useState(false);
      const overflow=globalThis.QingsongAssistantFailure.isOverflow(failure);
      const compact=async()=>{
        setRecovering(true);setRecovery('正在整理历史，原会话和教案保留…');
        try {const result=await ctx.remote.commands.execute(sessionId,'/compact',[]);if(!result?.ok||result.value?.result?.kind!=='success')throw Error('历史整理未能完成。');setRecovery('历史已整理。请核对教案和修改建议，再发送你的修改要求；本次没有自动重跑。');setCompactFailed(false);}catch{setRecovery('历史整理未完成。原会话和教案保留，可新建关联会话继续。');setCompactFailed(true);}finally{setRecovering(false);}
      };
      const newSession=()=>{const scope=ctx.sessions.scope(sessionId);const draft=scope?ctx.conversation.input.for(scope).snapshot.draft:'';setRecovering(true);parent.postMessage({type:'qingsong:preparation-recovery',connectionId,target:{preparationId:savedValue.preparationId,documentId:savedValue.documentId,revision:savedValue.revision,...(savedValue.selection&&!savedValue.selection.stale?{selection:{blockIds:savedValue.selection.blockIds,text:savedValue.selection.text,...(savedValue.selection.location?{location:savedValue.selection.location}:{})}}:{}),instruction:draft||savedValue.lastInstruction||'请继续修改当前教案。\n修改建议如下：\n'}},location.origin);};
      React.useEffect(() => {
        if (retry) return;
        const controller = new AbortController();
        setOutcome('正在核对教案保存状态…');
        fetch('./api/qingsong/preparation-outcome?sessionId=' + encodeURIComponent(sessionId), {signal:AbortSignal.any([controller.signal,AbortSignal.timeout(10000)]), cache:'no-store'})
          .then(async response => {if (!response.ok) throw Error(); return response.json();})
          .then(value => {if (!controller.signal.aborted) {setSavedValue(value);setOutcome(globalThis.QingsongAssistantFailure.saved(value,failure));}})
          .catch(() => {if (!controller.signal.aborted) setOutcome('保存状态尚未核对成功。请检查教案和修改建议，避免重复提交。');});
        return () => controller.abort();
      }, [sessionId, node.key, attempt, retry]);
      const current = retry ? node.data.current : null;
      return React.createElement('div', {className:'qs-failure-notice',role:'status'},
        React.createElement('p',null,globalThis.QingsongAssistantFailure.reason(failure)),
        retry ? React.createElement('p',null,current.retryState === 'scheduled' ? '系统正在按既定次数重试当前模型请求，请稍候；不会重发整轮操作。' : current.retryState === 'cancelled' ? '本次模型重试已取消。' : '已尝试重新连接模型服务。') : React.createElement('p',null,outcome),
        overflow&&!retry&&React.createElement('div',{className:'qs-failure-recovery'},React.createElement('button',{type:'button',disabled:recovering,onClick:()=>void compact()},recovering?'正在整理…':'整理历史后继续'),compactFailed&&savedValue?.bound&&React.createElement('button',{type:'button',disabled:recovering,onClick:newSession},'新建关联会话继续'),recovery&&React.createElement('p',{role:'status'},recovery)),
        !retry && React.createElement('button',{type:'button',onClick:()=>setAttempt(value=>value+1)},'重新核对保存状态'),
        React.createElement('details',null,React.createElement('summary',null,'技术详情'),React.createElement('pre',null,JSON.stringify({code:failure?.code,message:failure?.message,...(retry ? {delayMs:Math.round(current.delayMs),retry:current.retry,maxRetries:current.maxRetries} : {})},null,2))));
    }
    for (const [key,retry] of [['model-retry',true],['turn-error',false]]) {
      ctx.slots.inject('conversation.chat.node',()=>ctx.slots.register({name:'conversation.chat.node',key,priority:-100},props=>React.createElement(FailureNotice,{...props,retry})));
    }
    ctx.effect(() => ctx.inputTriggers.registerSource({
      name: materialSource, trigger: '@', candidates: async () => [], onPick: () => undefined,
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
      const pending = React.useRef(null), fileInput = React.useRef(null), menu = React.useRef(null);
      const inputRef=React.useRef({inputActions,insertReference});inputRef.current={inputActions,insertReference};
      const icon = path => React.createElement('svg',{viewBox:'0 0 24 24',width:18,height:18,fill:'none',stroke:'currentColor',strokeWidth:1.8,'aria-hidden':true},React.createElement('path',{d:path}));
      React.useEffect(() => {
        const outside = event => {if(!menu.current?.contains(event.target))setOpen(false);};
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
      return React.createElement('div',{className:'qs-materials-menu',ref:menu,onKeyDown:event=>{if(event.key==='Escape'){setOpen(false);setError('');}}},
        React.createElement('button',{type:'button',className:'qs-materials-button','aria-label':'添加附件或材料池资料','aria-expanded':open,'aria-haspopup':'menu',disabled:locked||picking,onClick:()=>{setError('');setOpen(value=>!value);}},icon('M12 5v14M5 12h14')),
        React.createElement('input',{type:'file',multiple:true,hidden:true,ref:fileInput,accept:'.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.tsv,.txt,.md,.markdown,.json,.yaml,.yml,.png,.jpg,.jpeg,.webp,.gif',onChange:event=>{
          const files=Array.from(event.target.files??[]);event.target.value='';setError('');
          if(files.length>20){setError('一次最多选择20个附件，尚未添加，请分批选择。');return;}
          try{addFiles(files,inputActions);}catch(error){setError(error.message||'附件未添加，原对话仍保留，请重试。');}
        }}),
        open&&React.createElement('div',{className:'qs-materials-options',role:'menu'},
          React.createElement('button',{type:'button',role:'menuitem',onClick:()=>{setOpen(false);fileInput.current.click();}},icon('M21 11.5 12 20.5a6 6 0 0 1-8.5-8.5l9-9a4 4 0 0 1 5.7 5.7l-9 9a2 2 0 0 1-2.8-2.8L15 6.5'),'上传文件'),
          React.createElement('button',{type:'button',role:'menuitem',onClick:pickPool},icon('M3 7h7l2-3h9v16H3Z'),'从材料池选择')),
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
      const cancel = () => {current?.controller.abort(); current = undefined; hostOpening=false;selectionVersion++;showGuard(null);};
      const receive = async event => {
        const data = event.data;
        if (event.origin !== location.origin || event.source !== parent || data?.connectionId !== connectionId) return;
        if (data.type === 'qingsong:cancel-context') {if (current?.requestId === data.requestId) cancel(); return;}
        if(data.type==='qingsong:prepare-context'){cancel();hostOpening=true;current={requestId:data.requestId,controller:new AbortController()};selectionVersion++;showGuard({});return;}
        if (data.type !== 'qingsong:open-context') return;
        cancel();
        hostOpening=true;selectionVersion++;showGuard({});
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
            hostTarget={...data.target,...target};showGuard(null);
            window.dispatchEvent(new CustomEvent('qingsong:association-checked',{detail:{sessionId:selectedSession()}}));
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
          showGuard(null);
          parent.postMessage({type:'qingsong:context-opened',connectionId,requestId:data.requestId,stage,error:(messages[stage]??'助手未能打开，')+'教案和原会话保留，请重试。'},location.origin);
        } finally {if (current === navigation) {current = undefined;hostOpening=false;}}
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
      const probe=event=>{if(event.origin===location.origin&&event.source===parent&&event.data?.type==='qingsong:probe'&&event.data.connectionId===connectionId)check(true);};
      window.addEventListener('message',probe);
      try{offWork=ctx.workspaces.list.subscribe(()=>check());offSessions=ctx.sessions.list.subscribe(()=>check());check();}
      catch{parent.postMessage({type:'qingsong:connection',connectionId,phase:'error',pending:'initialization'},location.origin);}
      return()=>{disposed=true;offWork();offSessions();window.removeEventListener('message',probe);};
    });
  },
})});
