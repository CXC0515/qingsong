import { readFileSync } from 'node:fs';
export const name = 'qingsong-official-ui';
export function apply(ctx) {
  const logo = readFileSync(new URL('./qingsong-logo.png', import.meta.url)).toString('base64');
  const css = readFileSync(new URL('./shell.css', import.meta.url), 'utf8');
  ctx.on('webserver/index-inject', table => { table.push({kind: 'style', text: css + '\n.qs-brand-mark{background-image:url(data:image/png;base64,' + logo + ')}'}); });
}
