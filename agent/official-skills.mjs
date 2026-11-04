import {parse} from 'yaml';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
/** Fixed published sources only; uploads and workspace directories never provide executable Skills. */
const files=[
 ['skills/system-data/SKILL.md',['class','student','classroomTask','resource','knowledge','grading']],
 ['skills/lesson-preparation/SKILL.md',['preparation','lessonPlan','preparationSource']],
 ['skills/chinese-teaching/SKILL.md',['preparation','lessonPlan']],
 ['skills/chinese-teaching/references/review.md',['lessonPlan']],
 ['skills/chinese-teaching/references/template.md',['lessonPlan']],
];
const published=files.map(([file,requires])=>{
 const source=readFileSync(new URL('./'+file,import.meta.url),'utf8');
 const header=parse(source.match(/^---\n([\s\S]*?)\n---\n/)?.[1]??'');
 if(typeof header.name!=='string'||typeof header.version!=='string'||typeof header.description!=='string')throw Error('Invalid published Skill');
 const sha256=createHash('sha256').update(source).digest('hex');
 return {manifest:Object.freeze({name:header.name,version:header.version,sha256,provider:'qingsong-business',requires}),source,header};
});
export const skillManifest=published[0].manifest;
export const skillManifests=Object.freeze(published.map(p=>p.manifest));
export const publishedSkillNames=new Set(skillManifests.map(m=>m.name));
export const name='qingsong-business-skills';
export const inject=['skills'];
export function apply(ctx){
 const summary=p=>({name:p.manifest.name,description:p.header.description+' v'+p.manifest.version,source:'qingsong',provider:p.manifest.provider,invocation:{modelInvocable:true,userInvocable:true}});
 ctx.skills.registerProvider(()=>({
  name:skillManifest.provider,
  async list(options){options.signal?.throwIfAborted();return published.map((p,rank)=>({...summary(p),rank,locator:p.manifest.name,metadata:{version:p.manifest.version,sha256:p.manifest.sha256}}));},
  async get(candidate,options){
   options.signal?.throwIfAborted();const p=published.find(p=>p.manifest.name===candidate.name&&p.manifest.provider===candidate.provider);if(!p)return;
   const response=await fetch(process.env.QS_TOOL_ENDPOINT,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+process.env.QS_TOOL_TOKEN},body:JSON.stringify({kind:'capability',action:'discover',input:{}}),signal:AbortSignal.any([...(options.signal?[options.signal]:[]),AbortSignal.timeout(15000)])});
   if(!response.ok)throw Error('Skill所需能力暂时无法核实，请重试。');
   const available=await response.json(),types=new Set(available.data?.objects?.map(item=>item.type)??[]);
   const missing=p.manifest.requires.filter(type=>!types.has(type));if(missing.length)throw Error('Skill所需能力尚未开放：'+missing.join('、')+'。正文未修改。');
   return {...summary(p),content:`版本：${p.manifest.version}；SHA256：${p.manifest.sha256}\n\n`+p.source.replace(/^---\n[\s\S]*?\n---\n/,''),metadata:{version:p.manifest.version,sha256:p.manifest.sha256}};
  }
 }));
}
