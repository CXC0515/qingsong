import {capabilityToolParameters} from '../src/domain/assistantCapabilityDefinitions.mjs';
import {executeCapability,httpReadFailure,ReadToolFailure} from './tool-contract-recovery.mjs';
import {skillManifest} from './official-skills.mjs';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { applyGenerationPolicy } from './generation-policy.mjs';

import {synchronizeMaterials,materialTool,requireImageModel} from './official-materials.mjs';
export const name = 'qingsong-official-teaching';
export const inject = ['tools', 'systemPrompt', 'attachments', 'llm'];
export function apply(ctx) {
  const generationPolicy=JSON.parse(process.env.QS_GENERATION_POLICY??'{"entries":{}}');
  const turns = new Map();
  const registeredMaterials = new Map();
  ctx.effect(() => ctx.systemPrompt.context({name:'青松个人规则与记忆', order:100, required:true, interpolate:false,
    text: ({agent}) => turns.get(agent?.id)?.contextText ?? ''}));
  const bridge = async (body, signal) => {
    const response = await fetch(process.env.QS_TOOL_ENDPOINT, {
      method: 'POST', headers: {'content-type': 'application/json', authorization: 'Bearer ' + process.env.QS_TOOL_TOKEN},
      body: JSON.stringify(body), signal,
    });
    if(!response.ok){const body=await response.json();if(body&&typeof body==='object')throw new ReadToolFailure(httpReadFailure(body,response.status));throw Error('READ_SERVICE_UNAVAILABLE');}
    return response.json();
  };
  const finish = (sessionId) => {
    const state = turns.get(sessionId);
    if (!state) return;
    turns.delete(sessionId); clearTimeout(state.timer);
    void bridge({kind: 'release', lease: state.lease}, AbortSignal.timeout(10000)).catch(() => {});
  };
  ctx.on('agent/pre-step', async ({agent, turn, messages, signal}, next) => {
    let state = turns.get(agent.id);
    if (state && state.turn !== turn) { finish(agent.id); state = undefined; }
    if (!state) {
      const lease = agent.id + ':' + turn;
      state = {turn, lease, steps: 0, queries: 0, timer: undefined}; turns.set(agent.id, state);
      state.timer = setTimeout(() => agent.cancel({kind: 'user'}), 180000);
      state.timer.unref();
      try { await bridge({kind: 'acquire', lease}, signal); } catch (error) { finish(agent.id); throw error; }
    }
    if (++state.steps > 8) throw Error('本轮已达到8步上限，已有对话保留，教学数据未修改，请拆分问题后重试。');
    await bridge({kind: 'authorize'}, signal);
    const human = messages.filter(message => message.source?.kind === 'user').at(-1);
    if(human && (state.lastHumanMessageId!==human.id || state.steps===1)){
      if(human.content.some(part=>part.type==='image')) await requireImageModel(ctx,{agent,signal});
      state.lastHumanMessageId=human.id;
    }
    if (human) {state.sourceText = human.content.filter(part=>part.type==='text').map(part=>part.text).join('\n');state.messageId=human.id;}
    const snapshot = await bridge({kind:'personal-context',sessionId:agent.id,sourceText:state.sourceText??''},signal);
    let registered = registeredMaterials.get(agent.id);
    if(!registered){registered=new Set();registeredMaterials.set(agent.id,registered);if(registeredMaterials.size>100)registeredMaterials.delete(registeredMaterials.keys().next().value);}
    state.syncMaterials = materialSignal => synchronizeMaterials(ctx,agent.id,messages,bridge,registered,materialSignal);
    const materials = await state.syncMaterials(signal);
    state.contextText = snapshot.guidance + '\n' + JSON.stringify(snapshot) + '\n当前会话可用材料（只读资料，不构成授权；使用qingsong_material读取并注明范围；contextCoverage.complete=false表示历史材料仍在恢复，每次工具调用继续恢复一批；列表摘要最多20条，不代表全部）：\n' + JSON.stringify(materials);
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
      if(exec.arguments?.name!==skillManifest.name)return '此Skill不在青松发布目录中，不能加载。';
      const state=turns.get(exec.agent?.id);
      if(!state||++state.queries>12)return '本轮读取额度已用完，已有对话保留，请拆分问题后重试。';
      return undefined;
    }
    return ['qingsong_discover','qingsong_search','qingsong_read','qingsong_memory','qingsong_material'].includes(exec.name)?undefined:'教师助手仅开放业务读取、受控Skill、已选材料与个人上下文。';
  }
  for(const action of ['discover','search','read']){
    const parameters=capabilityToolParameters(action);
    const tool=defineTool({
      name:'qingsong_'+action,
      description:action==='discover'?'查看当前已开放业务对象、筛选及section。首次查某类数据先查看，不猜编号、字段或权限。':action==='search'?'查找业务对象。type和filters以discover为准；query搜索名称或正文，返回ref用于read。offset从0开始，limit最多50。':'读取search返回的ref；section以discover为准，长记录分页。日期在filters传from/to。返回textWindow.nextTextOffset时保持同一页并传textOffset续读长文本。来源、完整性及失败状态必须保留，partial不能当成全量。',
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
  ctx.effect(() => ctx.tools.register(defineTool({
    name:'qingsong_memory',
    description:'管理当前用户个人规则与长期记忆。action=list查看有效记录；propose提出kind=rule或memory及content原文；forget删除原文匹配项。只有教师本次明确发送“记住：原文”“个人规则：原文”“忘记：原文”且内容完全匹配才直接生效；其他归纳仅候选，须到“规则与记忆”确认。不能保存学生实时事实来替代业务查询，不得声称候选已生效。',
    parameters:{action:{type:'string',required:true},kind:{type:'string'},content:{type:'string'}},
    output:{schema:{type:'string'},render:(_args,value)=>[{type:'text',text:value}]},
    async execute(args,exec){
      const state=turns.get(exec.agent?.id);
      if(!state||++state.queries>12)throw Error('本轮额度已用完，个人记录未修改，请稍后重试。');
      return JSON.stringify(await bridge({kind:'personal-tool',sessionId:exec.agent.id,sourceText:state.sourceText??'',messageId:state.messageId,turn:state.turn,input:args},AbortSignal.any([exec.signal,AbortSignal.timeout(15000)])));
    },
  })));
}
