(function () {
  function reason(failure) {
    const message = String(failure?.message ?? ''), code = failure?.code;
    if (code === 'INTERRUPTED') return '本次运行已停止。';
    if (code === 'AUTH' || code === 'ACCOUNT_SIGN_IN_REQUIRED' || code === 'ACCOUNT_SIGNED_OUT') return '助手的服务连接或登录需要重新确认，请重新登录或联系管理员。';
    if (code === 'QUOTA' || code === 'ACCOUNT_QUOTA' || /\b429\b/.test(message)) return '模型服务额度不足或请求过于频繁，请稍后继续或联系管理员。';
    if (/\b50[234]\b|Service temporarily unavailable/i.test(message)) return '模型服务暂时不可用，本次回答未能完成。';
    if (/timeout|timed out/i.test(message)) return '模型服务响应超时，本次回答未能完成。';
    return '本次回答未能完成，请查看保存状态后再继续。';
  }
  function saved(outcome) {
    if (!outcome?.bound) return '这条会话未关联教案，无法据此确认其他操作是否完成。请核对对应页面后再继续。';
    const labels = {queued:'等待处理',running:'仍在处理中',completed:'已完成',interrupted:'已中断',cancelled:'已取消',failed:'失败', 'needs-input':'等待补充信息'};
    const last = outcome.tasks?.[0];
    return `已核对：教案当前为第 ${outcome.revision} 版；此会话有 ${outcome.pending} 份待应用建议、${outcome.applied} 份已应用建议。${last ? '最近的备课任务' + (labels[last.status] ?? '状态待确认') + '。' : '此会话尚无备课任务记录。'}请核对教案和建议后，在原会话继续；不要直接重复整轮操作。`;
  }
  globalThis.QingsongAssistantFailure = Object.freeze({reason, saved});
})();
