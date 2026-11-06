import {SessionTitleProviderId} from '@deepseek-ai/dsh-session-title';
export const name='qingsong-session-title';
export const inject=['sessionTitle'];
export function titleFromPrompt(text,titles=[]) {
  const readable=text.replace(/\[\[青松(?:教案|材料):[0-9a-f-]{36}\]\]/gi,' ').replace(/\s+/g,' ').trim();
  return Array.from([titles[0],readable].filter(Boolean).join(' · ')||'教学讨论').slice(0,32).join('');
}
export function apply(ctx) {
  ctx.effect(()=>ctx.sessionTitle.register({id:SessionTitleProviderId(name),automatic:'first-prompt',async generate(request){
    const first=request.messages[0];const referenceIds=[...new Set([...first.text.matchAll(/\[\[青松教案:([0-9a-f-]{36})\]\]/gi)].map(match=>match[1].toLowerCase()))].slice(0,20);
    let titles=[];
    if(referenceIds.length)try{const response=await fetch(process.env.QS_TOOL_ENDPOINT,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+process.env.QS_TOOL_TOKEN},body:JSON.stringify({kind:'reference-titles',referenceIds}),signal:AbortSignal.any([request.signal,AbortSignal.timeout(5000)])});if(response.ok)titles=(await response.json()).titles;}catch{}
    return {title:titleFromPrompt(first.text,titles),messageSeqs:[first.seq]};
  }}));
}
