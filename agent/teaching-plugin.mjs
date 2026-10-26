import { defineTool } from '@deepseek-ai/dsh-tools';
export const name = 'qingsong-teaching';
export const inject = ['tools', 'llm'];
export function apply(ctx) {
  const enabled = Boolean(process.env.QS_TOOL_ENDPOINT);
  let calls = 0;
  let queries = 0;
  ctx.effect(() =>
    ctx.tools.guard((exec) =>
      enabled && exec.name === 'qingsong_query'
        ? undefined
        : '青松助手只允许受控教学查询。',
    ),
  );
  if (!enabled) {
    ctx.on('llm/stream', async function* () {
      throw Error('模型管理页仅用于配置，请返回青松工作台进行对话。');
    });
    return;
  }
  ctx.on('llm/stream', async function* (_options, next) {
    if (++calls > 8) throw Error('CALL_LIMIT');
    for await (const chunk of next()) {
      if (chunk.type === 'text-delta' && chunk.text) {
        await fetch(process.env.QS_TOOL_ENDPOINT, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${process.env.QS_TOOL_TOKEN}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ kind: 'delta', text: chunk.text }),
          signal: AbortSignal.timeout(10000),
        });
      }
      yield chunk;
    }
  });
  ctx.effect(() =>
    ctx.tools.register(
      defineTool({
        name: 'qingsong_query',
        description:
          '查询当前教师的课表(schedule)、班级名单(roster)、课堂任务与表现(classroom)。名单需classId，课堂查询需classId及from/to日期(YYYY-MM-DD)。返回只读事实与来源，不得编造查询结果。',
        parameters: {
          kind: { type: 'string', required: true },
          classId: { type: 'string' },
          from: { type: 'string' },
          to: { type: 'string' },
        },
        output: {
          schema: { type: 'string' },
          render: (_args, value) => [{ type: 'text', text: value }],
        },
        async execute(args, exec) {
          if (++queries > 12) throw Error('QUERY_LIMIT');
          const response = await fetch(process.env.QS_TOOL_ENDPOINT, {
            method: 'POST',
            headers: {
              authorization: `Bearer ${process.env.QS_TOOL_TOKEN}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify(args),
            signal: AbortSignal.any([exec.signal, AbortSignal.timeout(15000)]),
          });
          if (!response.ok)
            throw new Error('教学查询失败，未修改业务数据，请重试。');
          return response.text();
        },
      }),
    ),
  );
}
