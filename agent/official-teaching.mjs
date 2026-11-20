import {toolDefinition} from '../src/domain/harnessToolDefinitions.mjs';
import {registerSkillFileTool,attachSkillProvider} from './harness-skills.mjs';
import {attachHarnessObserver,createTrace,traceSafe} from './harness-observer.mjs';
import {preparationTool} from './official-preparation.mjs';
import {buildContext,refreshContext,businessRuntimeContext} from './context-builder.mjs';
import {executeCapability,httpReadFailure,ReadToolFailure} from './tool-contract-recovery.mjs';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { applyGenerationPolicy } from './generation-policy.mjs';

import {synchronizeMaterials,materialTool,requireImageModel} from './official-materials.mjs';
export const name = 'qingsong-official-teaching';
export const inject = ['tools', 'systemPrompt', 'attachments', 'llm', 'skills'];
export function apply(ctx) {
  const generationPolicy=JSON.parse(process.env.QS_GENERATION_POLICY??'{"entries":{}}');
  const turns = new Map();
  const registeredMaterials = new Map();
  const skillProviders=new WeakMap();
  ctx.effect(() => ctx.systemPrompt.context({name:'管理员配置的教学提示词', order:110, required:true, interpolate:false,
    text: ({agent}) => turns.get(agent?.id)?.adminPrompt ?? ''}));
  ctx.effect(() => ctx.systemPrompt.context({name:'教师个人规则', order:100, required:true, interpolate:false,
    text: ({agent}) => turns.get(agent?.id)?.contextParts?.rules ?? ''}));
  ctx.effect(() => ctx.systemPrompt.context({name:'本轮相关记忆与材料', order:200, required:true, interpolate:false,
    text: ({agent}) => turns.get(agent?.id)?.contextParts?.dynamic ?? ''}));
  ctx.effect(() => ctx.systemPrompt.context({name:'当前备课',order:175,required:true,interpolate:false,text:({agent})=>{const c=turns.get(agent?.id)?.preparationContext;return c?JSON.stringify(c):'';}}));
  ctx.effect(() => ctx.systemPrompt.context({name:'本轮备课连续状态',order:180,required:true,interpolate:false,text:({agent})=>{
    const state=turns.get(agent?.id);if(!state)return '';
    const loadedSkills=[...(state.loadedSkills??new Map())].map(([name,source])=>({name,source}));
    const toolStates=[...(state.recentToolStates??[])].slice(-12);
    return loadedSkills.length||toolStates.length?JSON.stringify({loadedSkills,toolStates,instructions:'Skill正文已加载时继续使用，不要重复调用skill。备课动作状态以成功核验回执为准；延续当前taskId与baseRevision，不重复begin、不更换版本或候选操作编号。失效资料引用先重新search核对当前来源，不得只换分页重读。'}):'';
  }}));
  ctx.effect(() => ctx.systemPrompt.context({name:'当前业务与上海日期', order:150, required:true, interpolate:false,
    text: ({agent}) => businessRuntimeContext(turns.get(agent?.id)?.businessContext ?? {complete:false,guidance:'候选尚未加载，使用qingsong_search查找。'})}));
  const bridge = async (body, signal) => {
    const response = await fetch(process.env.QS_TOOL_ENDPOINT, {
      method: 'POST', headers: {'content-type': 'application/json', authorization: 'Bearer ' + process.env.QS_TOOL_TOKEN},
      body: JSON.stringify(body), signal,
    });
    if(!response.ok){const body=await response.json();if(body&&typeof body==='object')throw new ReadToolFailure(httpReadFailure(body,response.status));throw Error('READ_SERVICE_UNAVAILABLE');}
    return response.json();
  };
  attachHarnessObserver(ctx,turns,bridge);
  registerSkillFileTool(ctx,turns);
  const registerLessonReferences = (sessionId, messages, human, signal) => {
    const ids = message => (message?.content ?? [])
      .filter(part => part.type === 'text')
      .flatMap(part => [...part.text.matchAll(/\[\[青松教案:([0-9a-f-]{36})\]\]/gi)].map(match => match[1].toLowerCase()));
    return bridge({
      kind: 'preparation-context', sessionId,
      referenceIds: [...new Set(messages.filter(message => message.source?.kind === 'user').flatMap(ids))].slice(-100),
      currentIds: ids(human),
    }, signal);
  };
  const finish = (sessionId) => {
    const state = turns.get(sessionId);
    if (!state) return;
    turns.delete(sessionId); clearTimeout(state.timer);
    if(state.sourceText&&state.messageId) void bridge({kind:'memory-observe',sessionId,sourceText:state.sourceText,messageId:state.messageId,turn:state.turn},AbortSignal.timeout(10000)).catch(()=>{});
    void bridge({kind: 'release', lease: state.lease, sessionId}, AbortSignal.timeout(10000)).catch(() => {});
  };
  ctx.on('agent/pre-step', async ({agent, turn, messages, signal}, next) => {
    let state = turns.get(agent.id);
    if (state && state.turn !== turn) { finish(agent.id); state = undefined; }
    if (!state) {
      const lease = agent.id + ':' + turn;
      state = {turn, lease, steps: 0, queries: 0, timer: undefined}; turns.set(agent.id, state);
      state.timer = setTimeout(() => agent.cancel({kind: 'user'}), 180000);
      state.timer.unref();
      const human=messages.filter(message=>message.source?.kind==="user").at(-1);
      try {
        const promptConfig = await bridge({kind:'dsh-prompts',sessionId:agent.id}, signal);
        const promptNode = promptConfig.nodes?.find(node => node.id === 'teaching-context' && node.enabled);
        state.revision=promptConfig.revision;
        state.runId=agent.id+':'+turn+':'+Date.now();
        state.trace=createTrace(bridge,state,agent.id);
        state.config=promptConfig;
        skillProviders.get(agent)?.();skillProviders.set(agent,attachSkillProvider(agent,turns,bridge));
        state.verifyPrompt=promptConfig.nodes.find(n=>n.id==='verify')?.content??'核对教师要求与执行回执，不确定不得通过。';
        state.adminPrompt = [promptNode?.content,...['main-agent','reply-format'].map(id=>promptConfig.nodes.find(n=>n.id===id)?.content)].filter(Boolean).join('\n\n');
        await state.trace('orchestrator','本轮开始','running',{revision:state.revision,messages:traceSafe(messages)});
        state.enabledSkills = new Set((promptConfig.library??[]).filter(skill=>!skill.archived).map(skill=>skill.id));
        state.preparationContext = await registerLessonReferences(agent.id, messages, human, signal);
        state.referenceMessageId = human?.id;
        const acquired = await bridge({kind: 'acquire', lease, sessionId: agent.id}, signal);
        state.budget = acquired.budget ?? {steps: 8, queries: 12, timeoutMs: 180000};
        clearTimeout(state.timer);
        state.timer = setTimeout(() => agent.cancel({kind: 'user'}), state.budget.timeoutMs);
        state.timer.unref();
      } catch (error) { finish(agent.id); throw error; }
    }
    if (++state.steps > (state.budget?.steps??8)) {
      const message='本轮备课尝试次数已用完，已有内容保留，请核对后从原会话继续未完成的备课。';
      console.warn('[青松助手] 备课执行次数用尽',{sessionId:agent.id,turn,steps:state.steps,limit:state.budget?.steps??8,compactions:state.compactions??0});
      throw Error(message);
    }
    await bridge({kind: 'authorize'}, signal);
    await state.trace('guard','步骤授权与预算','ok',{step:state.steps,budget:state.budget});
    if(!state.businessContext)state.businessContext=await bridge({kind:'business-context'},signal);
    const human = messages.filter(message => message.source?.kind === 'user').at(-1);
    if (human && state.referenceMessageId !== human.id) {
      state.preparationContext = await registerLessonReferences(agent.id, messages, human, signal);
      state.referenceMessageId = human.id;
    }
    if(human && (state.lastHumanMessageId!==human.id || state.steps===1)){
      if(human.content.some(part=>part.type==='image')) await requireImageModel(ctx,{agent,signal});
      state.lastHumanMessageId=human.id;
    }
    if (human) {state.sourceText = human.content.filter(part=>part.type==='text').map(part=>part.text).join('\n');state.messageId=human.id;}
    let registered = registeredMaterials.get(agent.id);
    if(!registered){registered=new Set();registeredMaterials.set(agent.id,registered);if(registeredMaterials.size>100)registeredMaterials.delete(registeredMaterials.keys().next().value);}
    state.syncMaterials = async materialSignal => {
      const materials = await synchronizeMaterials(ctx,agent.id,messages,bridge,registered,materialSignal);
      state.contextMaterials = materials;
      if(state.contextSnapshot) state.contextParts = buildContext(state.contextSnapshot,materials);
      return materials;
    };
    await refreshContext(state,{messageId:human?.id ?? 'empty',messages,
      loadPersonal:query=>bridge({kind:'personal-context',sessionId:agent.id,sourceText:state.sourceText??'',query},signal),
      loadMaterials:()=>state.syncMaterials(signal)});
    await state.trace('context','上下文准备完成','ok',{context:state.contextParts,preparation:state.preparationContext});
    await state.trace('memory','本轮记忆召回','ok',{snapshot:state.contextSnapshot});
    return next();
  });
  ctx.on('agent/request', async (_payload, next) => {
    const config = await next();
    return applyGenerationPolicy(config,generationPolicy);
  });
  ctx.on('session/event', (session, event) => {
    if(event.type==='compaction/start'){
      const state=turns.get(session.id);
      if(state)state.compactions=(state.compactions??0)+1;
      console.info('[青松助手] 历史整理开始',{sessionId:session.id,turn:event.data?.turn,count:state?.compactions??1});
    } else if(event.type==='compaction/end') {
      console.info('[青松助手] 历史整理结束',{sessionId:session.id,turn:event.data?.turn,failed:Boolean(event.data?.error)});
    }
    if (event.type === 'turn/end') { const state=turns.get(session.id);if(state)void state.trace('orchestrator','本轮结束',event.data?.error?'error':'ok',{event,traceIncomplete:!!state.traceIncomplete});finish(session.id); }
  });
  ctx.effect(() => () => { for (const id of [...turns.keys()]) finish(id); });
  function guardTool(exec){
    const state=turns.get(exec.agent?.id);
    console.info('[青松助手] 工具调用',{sessionId:exec.agent?.id,tool:exec.name,action:exec.arguments?.action,step:state?.steps});
    if(exec.name==='skill'){
      if(!state?.enabledSkills?.has(exec.arguments?.name))return '此Skill当前未在管理员配置中披露，不能加载。';

      if(!state||++state.queries>(state.budget?.queries??12))return '本轮读取额度已用完，已有对话保留，请拆分问题后重试。';
      return undefined;
    }
    return ['qingsong_skill_file','qingsong_discover','qingsong_search','qingsong_read','qingsong_memory','qingsong_material','qingsong_preparation','qingsong_schedule'].includes(exec.name)?undefined:'教师助手仅开放业务读取、受控Skill、已选材料、个人上下文和有限的个人日程操作。';
  }
  for(const action of ['discover','search','read']){
    const tool=defineTool({
      ...toolDefinition('qingsong_'+action),
      output:{schema:{type:'string'},render:(_args,value)=>[{type:'text',text:value}]},
      async execute(args,exec){
        return JSON.stringify(await bridge({kind:'capability',action,input:args},AbortSignal.any([exec.signal,AbortSignal.timeout(90000)])));
      },
    });
    const execute=tool.execute.bind(tool);
    tool.execute=(args,exec)=>executeCapability({state:turns.get(exec.agent?.id),action,args,exec,execute:()=>execute(args,exec)});
    ctx.effect(()=>ctx.tools.register(tool));
  }
  ctx.on('tools/post-execute',async(exec,result,next)=>{
    const decision=await next();
    const state=turns.get(exec.agent?.id),failure=state?.toolFailures?.get(exec.callId);
    if(failure)state.toolFailures.delete(exec.callId);
    if(state&&exec.name==='skill'&&!result.isError){
      const skillName=exec.arguments?.name,source=state.config?.library?.find(s=>s.id===skillName)?.files.find(f=>f.name==='SKILL.md')?.content;
      if(skillName&&source){state.loadedSkills??=new Map();state.loadedSkills.set(skillName,source);}
    }
    if(state&&exec.name==='qingsong_read'&&result.isError){
      const text=result.content?.map(block=>block.type==='text'?block.text:'').join(' ')??'';
      try{const parsed=JSON.parse(text);if(['OBJECT_NOT_FOUND','SOURCE_NOT_FOUND'].includes(parsed.code)){
        state.recentToolStates??=[];
        state.recentToolStates.push({action:'read',ref:exec.arguments?.ref,section:exec.arguments?.section,code:parsed.code,message:parsed.message});
        state.recentToolStates=state.recentToolStates.slice(-12);
      }}catch{}
    }
    if(result.isError&&failure&&decision.kind==='accept'){
      const {value:_value,...accepted}=decision;
      return {...accepted,content:[{type:'text',text:JSON.stringify(failure)}]};
    }
    return decision;
  });
  ctx.effect(() => ctx.tools.guard(exec => guardTool(exec)));
  ctx.effect(() => ctx.tools.register(materialTool(ctx,bridge,turns)));
  ctx.effect(() => ctx.tools.register(preparationTool(ctx,bridge,turns)));
  ctx.effect(()=>ctx.tools.register(defineTool({
    ...toolDefinition('qingsong_schedule'),
    output:{schema:{type:'string'},render:(_args,value)=>[{type:'text',text:value}]},
    async execute(args,exec){
      const state=turns.get(exec.agent?.id);
      if(!state||!state.messageId||!state.sourceText)throw Error('无法确认教师原始请求，本次没有创建或修改日程。');
      if(++state.queries>(state.budget?.queries??12))throw Error('本轮操作次数已达上限，日程未确认写入，请稍后查看日程。');
      const result=await bridge({kind:'schedule-tool',lease:state.lease,sessionId:exec.agent.id,messageId:state.messageId,sourceText:state.sourceText,input:args},AbortSignal.any([exec.signal,AbortSignal.timeout(30000)]));
      if(!result?.verified)throw Error('日程保存结果未能核实，可能已保存。请先查看日程，不要重复创建。');
      state.scheduleWrites??=[];state.scheduleWrites.push(result);return JSON.stringify(result);
    }
  })));
  ctx.effect(() => ctx.tools.register(defineTool({
    ...toolDefinition('qingsong_memory'),
    output:{schema:{type:'string'},render:(_args,value)=>[{type:'text',text:value}]},
    async execute(args,exec){
      const state=turns.get(exec.agent?.id);
      if(!state||++state.queries>(state.budget?.queries??12))throw Error('本轮额度已用完，个人记录未修改，请稍后重试。');
      const result=await bridge({kind:'personal-tool',sessionId:exec.agent.id,sourceText:state.sourceText??'',messageId:state.messageId,turn:state.turn,input:args},AbortSignal.any([exec.signal,AbortSignal.timeout(15000)]));
      state.contextReady=false;
      return JSON.stringify(result);
    },
  })));
}
