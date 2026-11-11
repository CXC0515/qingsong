(function () {
  function isOverflow(failure) {
    return failure?.code==='CONTEXT_WINDOW_EXCEEDED' || /context overflow|context window exceeded/i.test(String(failure?.message??''));
  }
  function reason(failure) {
    const message = String(failure?.message ?? ''), code = failure?.code;
    if (code === 'INTERRUPTED') return '本次运行已停止。';
    if (code === 'EXECUTION_STEP_LIMIT' || message.includes('本轮备课尝试次数已用完')) return '本轮备课尝试次数已用完，回答未能完成。请先核对教案和修改建议，再从原会话继续；不要重复整轮操作。';
    if (isOverflow(failure)) return '这条会话累积的内容超过模型容量，本次回答未能完成。请先核对保存状态，再整理历史；整理失败可新建会话继续。';
    if (code === 'AUTH' || code === 'ACCOUNT_SIGN_IN_REQUIRED' || code === 'ACCOUNT_SIGNED_OUT') return '助手的服务连接或登录需要重新确认，请重新登录或联系管理员。';
    if (code === 'QUOTA' || code === 'ACCOUNT_QUOTA' || /\b429\b/.test(message)) return '模型服务额度不足或请求过于频繁，请稍后继续或联系管理员。';
    if (/\b50[234]\b|Service temporarily unavailable/i.test(message)) return '模型服务暂时不可用，本次回答未能完成。';
    if (/timeout|timed out/i.test(message)) return '模型服务响应超时，本次回答未能完成。';
    return '本次回答未能完成，请查看保存状态后再继续。';
  }
  function classifiedCode(failure) {
    if (failure?.code === 'UNKNOWN' && String(failure?.message ?? '').includes('本轮备课尝试次数已用完')) return 'EXECUTION_STEP_LIMIT';
    return failure?.code ?? 'UNKNOWN';
  }
  function saved(outcome, failure) {
    if (!outcome?.bound) return '这条会话没有可核对的教案任务，无法据此确认其他操作是否完成。请核对对应页面后再继续。';
    const labels = {queued:'等待处理',running:'仍在处理中',completed:'已完成',interrupted:'已中断',cancelled:'已取消',failed:'失败', 'needs-input':'等待补充信息'};
    const proposalLabels={pending:'已保存，待教师查看和应用',applied:'已由教师应用',discarded:'已被丢弃'};
    const last = outcome.tasks?.[0];
    const task=last?`最近任务${labels[last.status]??'状态待确认'}${last.stage?'（'+last.stage+'）':''}${last.proposalStatus?'；关联修改建议'+proposalLabels[last.proposalStatus]:'；没有保存修改建议'}`:'此会话尚无备课任务记录';
    return `已核对：教案当前为第 ${outcome.revision} 版；本次会话有 ${outcome.pending} 份待应用建议、${outcome.applied} 份已应用建议；${task}。${isOverflow(failure)?'请先整理历史或新建会话，核对后再继续；不要直接重复整轮操作。':'请核对教案和建议后，在原会话继续；不要直接重复整轮操作。'}`;
  }
  globalThis.QingsongAssistantFailure = Object.freeze({reason, saved, isOverflow, classifiedCode});
})();
