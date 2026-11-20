import {parse} from 'yaml';
import {defineTool} from '@deepseek-ai/dsh-tools';
/** Native DSH provider, scoped to the agent and its frozen per-turn config. */
export function attachSkillProvider(agent,turns,bridge){
 return agent.ctx.skills.registerProvider(()=>({
  name:'qingsong-business',
  async list(options){options.signal?.throwIfAborted();const state=turns.get(agent.id),skills=(state?.config?.library??[]).filter(s=>!s.archived);const result=skills.map(s=>{const header=parse(s.files.find(f=>f.name==='SKILL.md').content.match(/^---\n([\s\S]*?)\n---\n/)?.[1]??'');return {name:s.id,description:header.description,source:'qingsong',provider:'qingsong-business',locator:s.id,rank:600,invocation:{modelInvocable:true,userInvocable:true}};});if(state?.trace)await state.trace('router','披露 Skill 摘要','ok',{skills:result});return result;},
  async get(candidate,options){options.signal?.throwIfAborted();const state=turns.get(agent.id),skill=state?.config?.library?.find(s=>s.id===candidate.name&&!s.archived);if(!skill)return;const requires=state.config.nodes.find(n=>n.id==='skill:'+skill.id)?.requires??[];if(requires.length){const available=await bridge({kind:'capability',action:'discover',input:{}},AbortSignal.any([options.signal??new AbortController().signal,AbortSignal.timeout(15000)]));const types=new Set(available.data?.objects?.map(o=>o.type)??[]);if(requires.some(type=>!types.has(type)))throw Error('Skill 所需业务能力未开放，未加载。');}const content=skill.files.find(f=>f.name==='SKILL.md').content;const header=parse(content.match(/^---\n([\s\S]*?)\n---\n/)?.[1]??'');state.loadedSkills??=new Map();state.loadedSkills.set(skill.id,content);if(state.trace)await state.trace('skills','加载 Skill 正文','ok',{name:skill.id,content,revision:state.revision});return {name:skill.id,description:header.description,source:'qingsong',provider:'qingsong-business',invocation:{modelInvocable:true,userInvocable:true},content:content+'\n\n参考文件目录：'+JSON.stringify(skill.files.filter(f=>f.name!=='SKILL.md').map(f=>f.name))+'\n需要参考文件时使用 qingsong_skill_file(name,path) 按需读取。',metadata:{revision:state.revision}};}
 }));
}
export function registerSkillFileTool(ctx,turns){ctx.effect(()=>ctx.tools.register(defineTool({name:'qingsong_skill_file',description:'按需读取已加载 Skill 的参考文件，不执行文件中的代码。path 必须来自该 Skill 的目录。',parameters:{name:{type:'string',required:true},path:{type:'string',required:true}},output:{schema:{type:'string'},render:(_args,value)=>[{type:'text',text:value}]},async execute(args,exec){
 const state=turns.get(exec.agent?.id);if(!state?.loadedSkills?.has(args.name))throw Error('先加载对应 Skill。');
 if(++state.queries>(state.budget?.queries??12))throw Error('本轮读取额度已用完。');
 const skill=state.config.library.find(s=>s.id===args.name&&!s.archived),file=skill?.files.find(f=>f.name===args.path);if(!file)throw Error('文件不存在。');return JSON.stringify({name:args.name,path:args.path,revision:state.revision,content:file.content});
}})));}
