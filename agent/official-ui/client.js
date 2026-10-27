window.__ModuleLoader__.load({id: '@qingsong/assistant-ui', factory: require => ({
  inject: ['slots', 'locale', 'layout', 'workspaces', 'sessions'],
  apply(ctx) {
    const React = require('react');
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
