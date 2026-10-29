import {parse} from 'yaml';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const source = readFileSync(new URL('./skills/system-data/SKILL.md',import.meta.url),'utf8');
const header=parse(source.match(/^---\n([\s\S]*?)\n---\n/)?.[1]??'');
if(header?.name!=='system-data'||typeof header.version!=='string'||typeof header.description!=='string')throw Error('Invalid published business Skill');
const digest = createHash('sha256').update(source).digest('hex');
export const skillManifest = Object.freeze({name:header.name,version:header.version,sha256:digest,provider:'qingsong-business',requires:['class','student','classroomTask','resource','knowledge','grading']});
export const name='qingsong-business-skills';
export const inject=['skills'];
export function apply(ctx){
  const summary={name:skillManifest.name,description:header.description+' v'+skillManifest.version,source:'qingsong',provider:skillManifest.provider,invocation:{modelInvocable:true,userInvocable:true}};
  ctx.skills.registerProvider(()=>({
    name:skillManifest.provider,
    async list(options){options.signal?.throwIfAborted();return [{...summary,rank:0,locator:skillManifest.name,metadata:{version:skillManifest.version,sha256:digest}}];},
    async get(candidate,options){
      options.signal?.throwIfAborted();if(candidate.name!==skillManifest.name||candidate.provider!==skillManifest.provider)return;
      const response=await fetch(process.env.QS_TOOL_ENDPOINT,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+process.env.QS_TOOL_TOKEN},body:JSON.stringify({kind:'capability',action:'discover',input:{}}),signal:AbortSignal.any([...(options.signal?[options.signal]:[]),AbortSignal.timeout(15000)])});
      if(!response.ok)throw Error('Skill所需能力暂时无法核实，数据未修改，请重试。');
      const available=await response.json();
      const types=new Set(available.data?.objects?.map(item=>item.type)??[]);
      const missing=skillManifest.requires.filter(type=>!types.has(type));
      if(missing.length)throw Error('Skill所需能力尚未开放：'+missing.join('、')+'。数据未修改。');
      // Loaded once per process: an active turn never mixes a later on-disk revision.
      return {...summary,content:`版本：${skillManifest.version}；SHA256：${digest}\n\n`+source.replace(/^---\n[\s\S]*?\n---\n/,''),metadata:{version:skillManifest.version,sha256:digest}};
    },
  }));
}
