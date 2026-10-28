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
    if (!response.ok) throw Error((await response.json()).message || '教学助手请求失败，业务数据未修改，请稍后重试。');
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
  ctx.effect(() => ctx.tools.guard(exec => ['qingsong_query','qingsong_memory','qingsong_material'].includes(exec.name) ? undefined : '教师助手只允许教学查询、当前会话已授权材料及当前用户的个人规则与记忆。'));
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
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'qingsong_query',
    description: '统一查询教学数据：capabilities能力范围、classes班级编号、schedule课表、roster名单/性别/在籍/班委实际任职、classroom课堂摘要、seating座位、reminders提醒、task任务逐人明细/纠错历史、student课堂记录与观察依据。先用classes取得classId，不把班名当编号。roster/seating需要classId；classroom需要classId/from/to；task需要classId/taskId；student需要classId/studentId/from/to。日期YYYY-MM-DD，最多31天；task/student/reminders用offset/limit分页，partial不是完整统计。班长以学生committeeRoles为准；无座位保存记录不等于已排座位。未支持/失败/缺字段不能回答成没有记录。返回事实与来源才能作为依据。',
    parameters: {kind: {type: 'string', required: true}, classId: {type: 'string'}, from: {type: 'string'}, to: {type: 'string'},studentId:{type:'string'},taskId:{type:'string'},offset:{type:'number'},limit:{type:'number'}},
    output: {schema: {type: 'string'}, render: (_args, value) => [{type: 'text', text: value}]},
    async execute(args, exec) {
      const state = turns.get(exec.agent?.id);
      if (!state || ++state.queries > 12) throw Error('本轮查询额度已用完，教学数据未修改，请拆分问题后重试。');
      return JSON.stringify(await bridge({kind: 'query', input: args}, AbortSignal.any([exec.signal, AbortSignal.timeout(15000)])));
    },
  })));
}
