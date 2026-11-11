const reminderAction = /提醒我|记下|记一下|记着|帮我记|加入日程|创建(?:一个|一条)?(?:个人)?(?:提醒|日程)/u;

export const shanghaiDateAt = (timestamp = Date.now()) => {
  const local = new Date(timestamp + 8 * 3600000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate())).toISOString().slice(0, 10);
};

export const resolveReminderStartAt = (time: string | undefined, date: string | undefined, submittedAt: number) => {
  if (!time) return undefined;
  const effectiveDate = date ?? shanghaiDateAt(submittedAt);
  if (!date && Date.parse(effectiveDate + 'T' + time + ':00+08:00') <= submittedAt) throw Error('SCHEDULE_TIME_PASSED');
  return effectiveDate + 'T' + time;
};

export const reminderNameFromText = (text: string) => text
  .replace(/20\d{2}年?\s*\d{1,2}[-年/]\s*\d{1,2}日?/gu, ' ')
  .replace(/大后天|后天|明天|今天|下周[一二三四五六日天]?|下星期[一二三四五六日天]?|本周[一二三四五六日天]?|这周[一二三四五六日天]?|本星期[一二三四五六日天]?|这星期[一二三四五六日天]?|周[一二三四五六日天]|星期[一二三四五六日天]/gu, ' ')
  .replace(/(?:凌晨|清晨|早上|上午|中午|下午|傍晚|晚上)?\s*(?:\d{1,2}[:：]\d{2}|[零〇一二两三四五六七八九十\d]+点(?:半|[零〇一二两三四五六七八九十\d]+分?)?)/gu, ' ')
  .replace(/^\s*(?:(?:麻烦(?:你)?|请(?:你)?|你帮我|帮我|我想|我要)\s*)?(?:提醒我|记一下|记下|记着|加入日程|创建(?:一个|一条)?(?:个人)?(?:提醒|日程))\s*/u, ' ')
  .replace(/[，,。.!！?？、：:;；\s]+/gu, ' ')
  .trim();

export const hasDirectReminderIntent = (text: string) => {
  const hypothetical = /(?:是不是|是否|要不要|需不需要|该不该|如果|假如|建议|你觉得).{0,24}(?:提醒我|记下|记一下|加入日程|创建(?:提醒|日程))/u;
  const negated = /(?:别(?:再)?|不要(?!忘|漏)|不必|不用|无需|先别|取消|删除|不想(?:让你|要你|再)?|不需要(?:让你|你)?|不是(?:要|想)?)(?:\s*(?:帮我|你)?\s*(?:再)?\s*(?:提醒我|记下|记一下|记着|加入日程|创建(?:一个|一条)?(?:个人)?(?:提醒|日程)))/u;
  return reminderAction.test(text) && !hypothetical.test(text) && !negated.test(text);
};

export const reminderTimeFromText = (text: string, submittedAt = Date.now()) => {
  const local = new Date(submittedAt + 8 * 3600000);
  const isoDay = (offset: number) => new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + offset)).toISOString().slice(0,10);
  const explicit = text.match(/(20[0-9]{2})[-年/]([0-9]{1,2})[-月/]([0-9]{1,2})日?/u);
  const relative = text.match(/大后天|后天|明天|今天/u)?.[0];
  const weekday = text.match(/(下周|下星期|本周|这周|本星期|这星期|周|星期)([一二三四五六日天])/u);
  const currentWeekday = local.getUTCDay();
  const targetWeekday = weekday ? ({一:1,二:2,三:3,四:4,五:5,六:6,日:0,天:0} as Record<string,number>)[weekday[2]] : undefined;
  const weekdayOffset = weekday && targetWeekday !== undefined
    ? /^(下周|下星期)$/u.test(weekday[1])
      ? 7 - ((currentWeekday + 6) % 7) + ((targetWeekday + 6) % 7)
      : /^(本周|这周|本星期|这星期)$/u.test(weekday[1])
        ? ((targetWeekday + 6) % 7) - ((currentWeekday + 6) % 7)
        : (targetWeekday - currentWeekday + 7) % 7
    : undefined;
  const date = explicit ? explicit[1]+'-'+explicit[2].padStart(2,'0')+'-'+explicit[3].padStart(2,'0') : relative ? isoDay(({今天:0,明天:1,后天:2,大后天:3} as Record<string,number>)[relative]) : weekdayOffset !== undefined ? isoDay(weekdayOffset) : undefined;
  const digits = (s:string):number => { if (/^[0-9]+$/.test(s)) return Number(s); const values:Record<string,number>={零:0,〇:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9}; if(s.includes('十')){const [a,b]=s.split('十');return (a?values[a]:1)*10+(b?values[b]:0);} return values[s]; };
  const clock = text.match(/([0-9]{1,2})[:：]([0-9]{2})/u);
  const chinese = text.match(/([零〇一二两三四五六七八九十0-9]+)点(?:(半)|([零〇一二两三四五六七八九十0-9]+)分?)?/u);
  let hour = clock ? Number(clock[1]) : chinese ? digits(chinese[1]) : undefined;
  const minute = clock ? Number(clock[2]) : chinese ? chinese[2] ? 30 : chinese[3] ? digits(chinese[3]) : 0 : undefined;
  if (hour !== undefined && /下午|晚上|傍晚/u.test(text) && hour < 12) hour += 12;
  if (hour === 12 && /凌晨/u.test(text)) hour = 0;
  const time = hour !== undefined && minute !== undefined && hour <= 23 && minute <= 59 ? String(hour).padStart(2,'0')+':'+String(minute).padStart(2,'0') : undefined;
  return {date,time};
};

export const hasScheduleTimeApproval = (text: string) => /^(?:好的?|可以|同意|确认|就这个时间|设为这个时间|按这个时间|就这样)[，,。！!\s]*$/u.test(text.trim());
export const hasScheduleTimeRejection = (text: string) => /^(?:不(?:要|用|行|同意)|算了|暂不设置|先不设置|不要这个时间|换个时间|换一个时间|取消建议)[，,。！!\s]*$/u.test(text.trim());
