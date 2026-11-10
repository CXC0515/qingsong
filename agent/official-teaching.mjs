import {preparationTool} from './official-preparation.mjs';
import {buildContext,refreshContext,businessRuntimeContext} from './context-builder.mjs';
import {capabilityToolParameters} from '../src/domain/assistantCapabilityDefinitions.mjs';
import {executeCapability,httpReadFailure,ReadToolFailure} from './tool-contract-recovery.mjs';
import {skillManifest,publishedSkillNames} from './official-skills.mjs';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { applyGenerationPolicy } from './generation-policy.mjs';

import {synchronizeMaterials,materialTool,requireImageModel} from './official-materials.mjs';
export const name = 'qingsong-official-teaching';
export const inject = ['tools', 'systemPrompt', 'attachments', 'llm'];
export function apply(ctx) {
  const generationPolicy=JSON.parse(process.env.QS_GENERATION_POLICY??'{"entries":{}}');
  const turns = new Map();
  const registeredMaterials = new Map();
  ctx.effect(() => ctx.systemPrompt.context({name:'管理员配置的教学提示词', order:110, required:true, interpolate:false,
    text: ({agent}) => turns.get(agent?.id)?.adminPrompt ?? ''}));
  ctx.effect(() => ctx.systemPrompt.context({name:'教师个人规则', order:100, required:true, interpolate:false,
    text: ({agent}) => turns.get(agent?.id)?.contextParts?.rules ?? ''}));
  ctx.effect(() => ctx.systemPrompt.context({name:'本轮相关记忆与材料', order:200, required:true, interpolate:false,
    text: ({agent}) => turns.get(agent?.id)?.contextParts?.dynamic ?? ''}));
  ctx.effect(() => ctx.systemPrompt.context({name:'当前备课',order:175,required:true,interpolate:false,text:({agent})=>{const c=turns.get(agent?.id)?.preparationContext;return c?JSON.stringify(c):'';}}));
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
        const promptConfig = await bridge({kind:'dsh-prompts'}, signal);
        const promptNode = promptConfig.nodes?.find(node => node.id === 'teaching-context' && node.enabled);
        state.adminPrompt = promptNode?.content ?? '';
        state.enabledSkills = new Set((promptConfig.nodes ?? []).filter(node => node.kind === 'skill' && node.enabled).map(node => node.id.slice('skill:'.length)));
        state.preparationContext = await registerLessonReferences(agent.id, messages, human, signal);
        state.referenceMessageId = human?.id;
        const acquired = await bridge({kind: 'acquire', lease, sessionId: agent.id}, signal);
        state.budget = acquired.budget ?? {steps: 8, queries: 12, timeoutMs: 180000};
        clearTimeout(state.timer);
        state.timer = setTimeout(() => agent.cancel({kind: 'user'}), state.budget.timeoutMs);
        state.timer.unref();
      } catch (error) { finish(agent.id); throw error; }
    }
    if (++state.steps > (state.budget?.steps??8)) throw Error('本轮已达到执行上限，已有内容保留，请缩小范围或继续未完成的备课。');
    await bridge({kind: 'authorize'}, signal);
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
    return next();
  });
  ctx.on('agent/request', async (_payload, next) => {
    const config = await next();
    return applyGenerationPolicy(config,generationPolicy);
  });
  ctx.on('session/event', (session, event) => { if (event.type === 'turn/end') finish(session.id); });
  ctx.effect(() => () => { for (const id of [...turns.keys()]) finish(id); });
  function guardTool(exec){
    if(exec.name==='skill'){
      if(!publishedSkillNames.has(exec.arguments?.name))return '此Skill不在青松发布目录中，不能加载。';
      const state=turns.get(exec.agent?.id);
      if(!state?.enabledSkills?.has(exec.arguments?.name))return '此Skill当前未在管理员配置中披露，不能加载。';
      if(!state||++state.queries>(state.budget?.queries??12))return '本轮读取额度已用完，已有对话保留，请拆分问题后重试。';
      return undefined;
    }
    return ['qingsong_discover','qingsong_search','qingsong_read','qingsong_memory','qingsong_material','qingsong_preparation','qingsong_schedule'].includes(exec.name)?undefined:'教师助手仅开放业务读取、受控Skill、已选材料、个人上下文和有限的个人日程操作。';
  }
  for(const action of ['discover','search','read']){
    const parameters=capabilityToolParameters(action);
    const tool=defineTool({
      name:'qingsong_'+action,
      description:action==='discover'?'查看当前已开放业务对象、筛选及section。首次查某类数据先查看，不猜编号、字段或权限。':action==='search'?'查找业务对象。type和filters以discover为准；query搜索名称或正文，不是整句自然语言问答。零命中先放宽query并核对候选。今天有课等关系描述先查schedule(onDate、scope)，用返回classId继续查班级。offset从0开始，limit最多50。':'读取search或当前业务上下文提供的真实ref；section以discover为准。班委任职读class的committee，不必扫描全班名单；多候选先结合上下文核对。长记录分页，日期在filters传from/to。textWindow.nextTextOffset用于续读。partial不能当成全量。',
      parameters,output:{schema:{type:'string'},render:(_args,value)=>[{type:'text',text:value}]},
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
    name:'qingsong_schedule',
    description:'管理当前教师自己的单条个人日程。只有教师明确委托创建时才直接创建；缺少时间先保存时间待定，保留用户给出的部分时间约束。先查询课表与节次，提议未来无课时段；只有教师接受后更新原事项，教师拒绝或暂不设置则只关闭建议并保留原事项。目标或内容依赖推测时用propose_create先展示名称、时间与假设，用户确认后才创建；找时间或一般讨论不直接创建。propose_create不写业务日程。create的name须为用户原话片段；明确时间用date+time。提议用proposalId和startAt（本地YYYY-MM-DDTHH:mm），confirm_time/reject_time用于唯一待确认提议。',
    parameters:{action:{type:'string',required:true,enum:['create','propose_create','propose_time','confirm_time','reject_time']},name:{type:'string'},date:{type:'string'},time:{type:'string'},proposalId:{type:'string'},reminderId:{type:'string'},startAt:{type:'string'}},
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
    name:'qingsong_memory',
    description:'管理当前用户个人规则与长期记忆。已配置自动记忆时，普通聊天中明确的个人背景和偏好由后台整理，不必要求教师使用固定口令，也不要为自动记忆重复调用propose。action=list查看有效记录；propose提出kind=rule或memory及content原文；forget删除原文匹配项。本工具只有本次明确发送“记住：原文”“个人规则：原文”“忘记：原文”且完全匹配才直接生效；其他工具提议仅候选，须到“规则与记忆”确认。工具结果和上下文状态才是保存依据，不得声称后台任务或候选已保存成功。不能保存学生实时事实来替代业务查询。',
    parameters:{action:{type:'string',required:true},kind:{type:'string'},content:{type:'string'}},
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
