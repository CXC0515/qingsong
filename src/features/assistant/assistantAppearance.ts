// The native view is a separate same-origin document. Only copy visual tokens;
// do not reload it or modify its model, session, storage or navigation state.
export function syncAssistantAppearance(document:Document,host:Pick<CSSStyleDeclaration,'getPropertyValue'>) {
  const values={
    '--dsw-alias-bg-base':'--qs-workbench-surface',
    '--dsw-alias-bg-layer-1':'--qs-workbench-surface',
    '--dsw-alias-bg-layer-2':'--qs-workbench-surface',
    '--dsw-alias-bg-layer-3':'--qs-workbench-surface',
    '--dsh-boot-bg':'--qs-workbench-surface',
    '--dsw-alias-label-primary':'--qs-ink',
    '--dsw-alias-label-secondary':'--qs-muted',
    '--dsw-alias-label-tertiary':'--qs-muted',
    '--dsw-alias-border-l2':'--qs-line',
    '--dsw-alias-interactive-bg-hover':'--theme-primary-light',
  };
  for(const [target,source] of Object.entries(values)){
    const value=host.getPropertyValue(source).trim();
    if(value)for(const root of [document.documentElement,document.body])root?.style.setProperty(target,value,'important');
  }
}
