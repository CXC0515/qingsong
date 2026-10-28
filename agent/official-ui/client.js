window.__ModuleLoader__.load({id: '@qingsong/assistant-ui', factory: require => ({
  inject: ['slots', 'locale', 'layout', 'uiWorkspace', 'workspaces', 'sessions', 'conversation', 'inputTriggers'],
  apply(ctx) {
    const React = require('react');
    const materialSource = 'qingsong-pool';
    const materialToken = id => '[[青松材料:' + id + ']]';
    const materialUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const connectionId = (window.name || '').replace(/^qingsong-assistant:/, '');
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
      const icon = path => React.createElement('svg',{viewBox:'0 0 24 24',width:18,height:18,fill:'none',stroke:'currentColor',strokeWidth:1.8,'aria-hidden':true},React.createElement('path',{d:path}));
      React.useEffect(() => {
        const outside = event => {if(!menu.current?.contains(event.target))setOpen(false);};
        document.addEventListener('pointerdown',outside);
        return () => document.removeEventListener('pointerdown',outside);
      },[]);
      React.useEffect(() => {
        const receive = event => {
          const data=event.data, request=pending.current;
          if(event.origin!==location.origin || event.source!==parent || !request || data?.connectionId!==connectionId || data?.requestId!==request.id || data?.sessionId!==sessionId || !['qingsong:materials-picked','qingsong:materials-cancelled'].includes(data?.type))return;
          clearTimeout(request.timer); pending.current=null;setPicking(false);
          if(data.type==='qingsong:materials-cancelled')return;
          if(!Array.isArray(data.references)||!data.references.length||data.references.length>20||data.references.some(ref=>!materialUuid.test(ref?.id)||typeof ref.name!=='string')) {setError('资料引用未添加，请从材料池重新选择。');return;}
          let span=request.span;
          for(const ref of data.references) {
            if(!insertReference({source:materialSource,ref:ref.id,label:'材料池 · '+ref.name.slice(0,160),appearance:'file',clipboardText:materialToken(ref.id)},span)) {
              setError('输入内容已变化，部分资料可能未添加。请核对输入区后重新选择。');return;
            }
            span=inputActions.captureInsertion();
          }
          inputActions.persistDraft();
        };
        window.addEventListener('message',receive);
        return()=>{window.removeEventListener('message',receive);if(pending.current)clearTimeout(pending.current.timer);pending.current=null;};
      },[sessionId,inputActions,insertReference]);
      const pickPool=()=>{
        setOpen(false);setError('');setPicking(true);
        const id=crypto.randomUUID(), span=inputActions.captureInsertion();
        const timer=setTimeout(()=>{if(pending.current?.id===id){pending.current=null;setPicking(false);setError('材料池选择已超时，输入内容仍保留，请重新打开。');}},300000);
        pending.current={id,span,timer};
        parent.postMessage({type:'qingsong:pick-materials',requestId:id,sessionId,connectionId},location.origin);
      };
      return React.createElement('div',{className:'qs-materials-menu',ref:menu,onKeyDown:event=>{if(event.key==='Escape')setOpen(false);}},
        React.createElement('button',{type:'button',className:'qs-materials-button','aria-label':'添加附件或材料池资料','aria-expanded':open,'aria-haspopup':'menu',disabled:locked||picking,onClick:()=>setOpen(value=>!value)},icon('M12 5v14M5 12h14')),
        React.createElement('input',{type:'file',multiple:true,hidden:true,ref:fileInput,accept:'.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.tsv,.txt,.md,.markdown,.json,.yaml,.yml,.png,.jpg,.jpeg,.webp,.gif',onChange:event=>{
          const files=Array.from(event.target.files??[]);event.target.value='';setError('');
          if(files.length>20){setError('一次最多选择20个附件，尚未添加，请分批选择。');return;}
          try{addFiles(files,inputActions);}catch(error){setError(error.message||'附件未添加，原对话仍保留，请重试。');}
        }}),
        open&&React.createElement('div',{className:'qs-materials-options',role:'menu'},
          React.createElement('button',{type:'button',role:'menuitem',onClick:()=>{setOpen(false);fileInput.current.click();}},icon('M21 11.5 12 20.5a6 6 0 0 1-8.5-8.5l9-9a4 4 0 0 1 5.7 5.7l-9 9a2 2 0 0 1-2.8-2.8L15 6.5'),'上传文件'),
          React.createElement('button',{type:'button',role:'menuitem',onClick:pickPool},icon('M3 7h7l2-3h9v16H3Z'),'从材料池选择')),
        error&&React.createElement('span',{className:'qs-materials-error',role:'alert'},error));
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
