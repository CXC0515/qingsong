import { defineTool } from '@deepseek-ai/dsh-tools';
export const name = 'qingsong-official-teaching';
export const inject = ['tools'];
export function apply(ctx) {
  const turns = new Map();
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
  ctx.on('agent/pre-step', async ({agent, turn, signal}, next) => {
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
    return next();
  });
  ctx.on('agent/request', async (_payload, next) => {
    const config = await next();
    return {...config, maxTokens: Math.min(config.maxTokens ?? 2048, 2048)};
  });
  ctx.on('session/event', (session, event) => { if (event.type === 'turn/end') finish(session.id); });
  ctx.effect(() => () => { for (const id of [...turns.keys()]) finish(id); });
  ctx.effect(() => ctx.tools.guard(exec => exec.name === 'qingsong_query' ? undefined : '教师助手只允许查询当前教师的教学数据。'));
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'qingsong_query',
    description: '统一查询当前教师教学数据：能力范围(capabilities)、班级列表(classes)、课表(schedule)、班级名单/性别/在籍状态/班委岗位与实际任职(roster)、课堂任务和表现摘要(classroom)。先用classes取得真实classId，不得把班名当作classId。roster需要classId；classroom需要classId及from/to日期(YYYY-MM-DD)。班长等任职以学生committeeRoles为准，岗位目录不代表有人任职。问题超出这些范围时先用capabilities确认；未开放、字段缺失、查询失败或partial不能回答成没有记录。只能使用返回的事实、来源和完整性标记。',
    parameters: {kind: {type: 'string', required: true}, classId: {type: 'string'}, from: {type: 'string'}, to: {type: 'string'}},
    output: {schema: {type: 'string'}, render: (_args, value) => [{type: 'text', text: value}]},
    async execute(args, exec) {
      const state = turns.get(exec.agent?.id);
      if (!state || ++state.queries > 12) throw Error('本轮查询额度已用完，教学数据未修改，请拆分问题后重试。');
      return JSON.stringify(await bridge({kind: 'query', input: args}, AbortSignal.any([exec.signal, AbortSignal.timeout(15000)])));
    },
  })));
}
