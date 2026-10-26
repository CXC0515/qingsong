import { readFileSync } from 'node:fs';
export const name = 'qingsong-official-ui';
export function apply(ctx) {
  const css = readFileSync(new URL('./shell.css', import.meta.url), 'utf8');
  ctx.on('webserver/index-inject', table => { table.push({kind: 'style', text: css}); });
}
