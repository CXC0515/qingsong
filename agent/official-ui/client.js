window.__ModuleLoader__.load({id: '@qingsong/assistant-ui', factory: require => ({
  inject: ['slots', 'locale', 'layout', 'uiWorkspace', 'workspaces', 'sessions'],
  apply(ctx) {
    const React = require('react');
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
    // The preference is provided by the isolated host; do not write admin settings from the client.
    ctx.effect(() => {
      void (async () => {
        try {
          await new Promise(resolve => {
            const check = () => { if (ctx.workspaces.list.getSnapshot().phase === 'ready' && ctx.sessions.list.getSnapshot().phase === 'ready') { offWork(); offSessions(); resolve(); } };
            const offWork = ctx.workspaces.list.subscribe(check), offSessions = ctx.sessions.list.subscribe(check); check();
          });
          // Official navigation restores the current selection; a second startup navigation races it.
          parent.postMessage({type: 'qingsong:ready'}, location.origin);
        } catch { parent.postMessage({type: 'qingsong:error'}, location.origin); }
      })();
    });
  },
})});
