import { ZodError } from 'zod';

export function teachingFailure(error: unknown) {
  const code = error instanceof ZodError ? 'INVALID_QUERY' : error instanceof Error ? error.message : 'INTERNAL_ERROR';
  const messages: Record<string, string> = {
    QUERY_UNSUPPORTED: '当前未开放此类数据查询，不能据此判断没有记录。教学数据未修改。请用capabilities查看已支持的查询范围，或请教师到对应业务页面核对。',
    INVALID_QUERY: '查询参数格式不正确，教学数据未修改。请按工具参数重新查询；日期使用YYYY-MM-DD。',
    CLASS_REQUIRED: '查询缺少班级编号，教学数据未修改。请先用classes查询班级列表，再用返回的真实classId查询。',
    CLASS_NOT_FOUND: '当前可访问班级中没有此编号，教学数据未修改。请先用classes查询班级列表，不要把班名当作classId。',
    DATE_RANGE_REQUIRED: '课堂查询需要有效起止日期，跨度最多31天，教学数据未修改。请补全from/to后重试。',
    AUTH_EXPIRED: '登录已失效，教学数据未修改。请重新登录后重试。',
    ACCESS_DENIED: '当前账号无权访问这些数据，教学数据未修改。请核对账号或联系管理员。',
    QUEUE_FULL: '助手正在处理其他请求，已有对话保留，教学数据未修改。请稍后重试。',
    INVALID_LEASE: '本轮请求状态不匹配，已有对话保留，教学数据未修改。请重新发送问题。',
    CLOSING: '助手连接正在更新，已有对话保留，教学数据未修改。请稍后重试。',
    TURN_CANCELLED: '本轮请求已取消，已有对话保留，教学数据未修改。需要时可重新提问。',
  };
  return {code: messages[code] ? code : 'INTERNAL_ERROR', message: messages[code] ?? '查询服务暂时未能完成，已有对话保留，教学数据未修改。请稍后重试。'};
}

export function officialAssetCache(pathname: string, contentType: string) {
  if (!/(javascript|text\/css)/i.test(contentType)) return 'no-store';
  if (/^\/assets\/[^/]+-[a-zA-Z0-9_-]{8,}\.(?:js|css)$/.test(pathname)) return 'private, max-age=31536000, immutable';
  if (pathname.startsWith('/plugins/')) return 'private, max-age=0, must-revalidate';
  return 'no-store';
}
