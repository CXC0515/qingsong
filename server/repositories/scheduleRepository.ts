/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash, randomUUID } from 'node:crypto';
import { ReminderRecurrence, ScheduleItem, SchedulePeriod, TimerReminder } from '../../src/domain/types';
import { getRosterDatabase } from '../database/rosterDatabase';

const database = getRosterDatabase();
const now = () => new Date().toISOString();

interface ScheduleRow {
  id: string; day: number; period: number; title: string; class_id: string | null; class_name: string;
  item_type: ScheduleItem['type']; time_text: string; scope: 'teacher' | 'class'; teacher_name: string; confidence: number | null;
}
interface ReminderRow {
  id: string; name: string; class_id: string | null; class_name: string; time_text: string; repeat_rule: string;
  status: TimerReminder['status']; important: number; urgent: number; due_at: string | null;
  time_kind: NonNullable<TimerReminder['timeKind']>; start_at: string | null; end_at: string | null;
  completed_at: string | null; sort_order: number; assumption_warning: string; recurrence_json: string | null;
  series_id: string | null; occurrence_number: number; generated_from_id: string | null;
}
interface PeriodRow { period: number; label: string; start_time: string; end_time: string; }

const toSchedule = (row: ScheduleRow): ScheduleItem => ({
  id: row.id, day: row.day, period: row.period, title: row.title, classId: row.class_id ?? '', className: row.class_name,
  type: row.item_type, time: row.time_text, scope: row.scope, teacherName: row.teacher_name, confidence: row.confidence ?? undefined
});
const toReminder = (row: ReminderRow): TimerReminder => ({
  id: row.id, name: row.name, classId: row.class_id ?? '', className: row.class_name, time: row.time_text,
  repeatRule: row.repeat_rule, status: row.status, important: Boolean(row.important), urgent: Boolean(row.urgent),
  dueAt: row.due_at ?? undefined, timeKind: row.time_kind, startAt: row.start_at ?? undefined, endAt: row.end_at ?? undefined,
  completedAt: row.completed_at ?? undefined, sortOrder: row.sort_order, assumptionWarning: row.assumption_warning || undefined,
  recurrence: row.recurrence_json ? JSON.parse(row.recurrence_json) as ReminderRecurrence : undefined,
  seriesId: row.series_id ?? undefined, occurrenceNumber: row.occurrence_number, generatedFromId: row.generated_from_id ?? undefined
});

export const listScheduleItems = () => (database.prepare('SELECT * FROM schedule_items ORDER BY day, period, created_at').all() as ScheduleRow[]).map(toSchedule);
export const listReminders = () => (database.prepare("SELECT * FROM timer_reminders ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'completed' THEN 1 ELSE 2 END, important DESC, urgent DESC, sort_order, COALESCE(due_at, updated_at), created_at").all() as ReminderRow[]).map(toReminder);
export const listSchedulePeriods = (): SchedulePeriod[] => (database.prepare('SELECT * FROM schedule_periods ORDER BY period').all() as PeriodRow[]).map(row => ({ period: row.period, label: row.label, startTime: row.start_time, endTime: row.end_time }));

export const saveSchedulePeriods = (periods: SchedulePeriod[]) => database.transaction(() => {
  database.prepare('DELETE FROM schedule_periods').run();
  const statement = database.prepare(`
    INSERT INTO schedule_periods (period, label, start_time, end_time, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(period) DO UPDATE SET label=excluded.label, start_time=excluded.start_time, end_time=excluded.end_time, updated_at=excluded.updated_at
  `);
  const timestamp = now();
  periods.forEach(item => statement.run(item.period, item.label, item.startTime, item.endTime, timestamp));
  return listSchedulePeriods();
})();

export const saveScheduleItem = (input: ScheduleItem): ScheduleItem => {
  const id = input.id || randomUUID();
  const timestamp = now();
  database.prepare(`
    INSERT INTO schedule_items (id, day, period, title, class_id, class_name, item_type, time_text, scope, teacher_name, confidence, created_at, updated_at)
    VALUES (?, ?, ?, ?, NULLIF(?, ''), ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET day=excluded.day, period=excluded.period, title=excluded.title, class_id=excluded.class_id,
      class_name=excluded.class_name, item_type=excluded.item_type, time_text=excluded.time_text, scope=excluded.scope,
      teacher_name=excluded.teacher_name, confidence=excluded.confidence, updated_at=excluded.updated_at
  `).run(id, input.day, input.period, input.title, input.classId, input.className, input.type, input.time,
    input.scope ?? 'teacher', input.teacherName ?? '', input.confidence ?? null, timestamp, timestamp);
  return toSchedule(database.prepare('SELECT * FROM schedule_items WHERE id = ?').get(id) as ScheduleRow);
};

export const saveScheduleItems = (items: ScheduleItem[]) => database.transaction(() => items.map(saveScheduleItem))();
export const deleteScheduleItem = (id: string) => database.prepare('DELETE FROM schedule_items WHERE id = ?').run(id).changes > 0;

const parseLocal = (value: string) => {
  const [datePart, timePart = '00:00'] = value.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute] = timePart.split(':').map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour, minute));
};
const formatLocal = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}T${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;
const addMonthsClamped = (date: Date, months: number, preferredDay = date.getUTCDate()) => {
  const result = new Date(date);
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(preferredDay === 0 ? lastDay : Math.min(preferredDay, lastDay));
  return result;
};
const nextOccurrenceStart = (startAt: string, recurrence: ReminderRecurrence) => {
  const current = parseLocal(startAt);
  const interval = Math.max(1, recurrence.interval || 1);
  if (recurrence.unit === 'day') current.setUTCDate(current.getUTCDate() + interval);
  else if (recurrence.unit === 'year') current.setUTCFullYear(current.getUTCFullYear() + interval);
  else if (recurrence.unit === 'month') {
    const preferred = recurrence.monthDays?.[0] ?? current.getUTCDate();
    return formatLocal(addMonthsClamped(current, interval, preferred));
  } else {
    const weekdays = [...new Set(recurrence.weekdays?.filter(day => day >= 1 && day <= 7) ?? [])].sort();
    if (!weekdays.length) current.setUTCDate(current.getUTCDate() + 7 * interval);
    else {
      const currentWeekday = current.getUTCDay() || 7;
      const nextDay = weekdays.find(day => day > currentWeekday);
      current.setUTCDate(current.getUTCDate() + (nextDay ? nextDay - currentWeekday : 7 * interval - currentWeekday + weekdays[0]));
    }
  }
  return formatLocal(current);
};
const displayReminderTime = (kind: TimerReminder['timeKind'], startAt?: string, endAt?: string) => kind === 'none' || !startAt
  ? '时间待定'
  : kind === 'range' && endAt ? `${startAt.replace('T', ' ')} - ${endAt.replace('T', ' ')}` : startAt.replace('T', ' ');

const saveReminderRecord = (input: TimerReminder): TimerReminder => {
  const id = input.id || randomUUID();
  const timestamp = now();
  database.prepare(`
    INSERT INTO timer_reminders (id, name, class_id, class_name, time_text, repeat_rule, status, important, urgent, due_at, time_kind, start_at, end_at, completed_at, sort_order, assumption_warning, recurrence_json, series_id, occurrence_number, generated_from_id, created_at, updated_at)
    VALUES (?, ?, NULLIF(?, ''), ?, ?, ?, ?, ?, ?, NULLIF(?, ''), ?, NULLIF(?, ''), NULLIF(?, ''), NULLIF(?, ''), ?, ?, ?, NULLIF(?, ''), ?, NULLIF(?, ''), ?, ?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name, class_id=excluded.class_id, class_name=excluded.class_name,
      time_text=excluded.time_text, repeat_rule=excluded.repeat_rule, status=excluded.status, important=excluded.important,
      urgent=excluded.urgent, due_at=excluded.due_at, time_kind=excluded.time_kind, start_at=excluded.start_at,
      end_at=excluded.end_at, completed_at=excluded.completed_at, sort_order=excluded.sort_order,
      assumption_warning=excluded.assumption_warning, recurrence_json=excluded.recurrence_json, series_id=excluded.series_id,
      occurrence_number=excluded.occurrence_number, generated_from_id=excluded.generated_from_id, updated_at=excluded.updated_at
  `).run(id, input.name, input.classId, input.className, input.time, input.repeatRule, input.status,
    input.important ? 1 : 0, input.urgent ? 1 : 0, input.dueAt ?? input.startAt ?? '', input.timeKind ?? (input.startAt || input.dueAt ? 'point' : 'none'),
    input.startAt ?? input.dueAt ?? '', input.endAt ?? '', input.completedAt ?? '', input.sortOrder ?? 0,
    input.assumptionWarning ?? '', input.recurrence?.enabled ? JSON.stringify(input.recurrence) : null,
    input.seriesId ?? (input.recurrence?.enabled ? id : ''), input.occurrenceNumber ?? 1, input.generatedFromId ?? '', timestamp, timestamp);
  return toReminder(database.prepare('SELECT * FROM timer_reminders WHERE id = ?').get(id) as ReminderRow);
};

export const saveReminder = (input: TimerReminder): TimerReminder => database.transaction(() => {
  const existingRow = input.id ? database.prepare('SELECT * FROM timer_reminders WHERE id = ?').get(input.id) as ReminderRow | undefined : undefined;
  const existing = existingRow ? toReminder(existingRow) : undefined;
  const completing = existing?.status === 'active' && input.status === 'completed';
  const reopening = existing?.status === 'completed' && input.status === 'active';
  const saved = saveReminderRecord({ ...input, completedAt: input.status === 'completed' ? input.completedAt ?? now() : undefined });
  if (reopening) database.prepare("DELETE FROM timer_reminders WHERE generated_from_id = ? AND status = 'active'").run(saved.id);
  if (completing && saved.recurrence?.enabled && saved.startAt) {
    const nextNumber = (saved.occurrenceNumber ?? 1) + 1;
    const nextStart = nextOccurrenceStart(saved.startAt, saved.recurrence);
    const withinCount = !saved.recurrence.maxOccurrences || nextNumber <= saved.recurrence.maxOccurrences;
    const withinDate = !saved.recurrence.endDate || nextStart.slice(0, 10) <= saved.recurrence.endDate;
    if (withinCount && withinDate) {
      const duration = saved.endAt ? parseLocal(saved.endAt).getTime() - parseLocal(saved.startAt).getTime() : 0;
      const nextEnd = saved.endAt ? formatLocal(new Date(parseLocal(nextStart).getTime() + duration)) : undefined;
      saveReminderRecord({ ...saved, id: randomUUID(), status: 'active', completedAt: undefined, startAt: nextStart,
        endAt: nextEnd, dueAt: nextStart, time: displayReminderTime(saved.timeKind, nextStart, nextEnd),
        occurrenceNumber: nextNumber, generatedFromId: saved.id, assumptionWarning: undefined });
    }
  }
  return saved;
})();

export const getWorkbenchShortcuts = (userId: string) => {
  const row=database.prepare('SELECT destinations_json,version FROM workbench_shortcuts WHERE user_id=?').get(userId) as {destinations_json:string;version:number}|undefined;
  return row?{destinations:JSON.parse(row.destinations_json) as string[],version:row.version}:{destinations:['classroom-tasks','grading-workspace','lesson-plan','classroom'],version:0};
};

export const saveWorkbenchShortcuts = (userId:string,destinations:string[],expectedVersion:number) => database.transaction(()=>{
  const current=getWorkbenchShortcuts(userId);
  if(current.version!==expectedVersion)throw Error('WORKBENCH_SHORTCUTS_CONFLICT');
  const next={destinations,version:current.version+1};
  database.prepare(`INSERT INTO workbench_shortcuts(user_id,destinations_json,version,updated_at) VALUES(?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET destinations_json=excluded.destinations_json,version=excluded.version,updated_at=excluded.updated_at`).run(userId,JSON.stringify(destinations),next.version,now());
  return next;
})();

export const createAssistantReminder = (input:{operationId:string;userId:string;messageId:string;fingerprint:string;name:string;timeKind:'none'|'point';startAt?:string;timeLabel?:string})=>database.transaction(()=>{
  const sameMessage=database.prepare("SELECT user_id,message_id,action,fingerprint,result_json FROM assistant_schedule_operations WHERE user_id=? AND message_id=? AND action='create' ORDER BY created_at LIMIT 1").get(input.userId,input.messageId) as {user_id:string;message_id:string;action:string;fingerprint:string;result_json:string}|undefined;
  if(sameMessage){if(sameMessage.fingerprint!==input.fingerprint)throw Error('ASSISTANT_OPERATION_ID_CONFLICT');return JSON.parse(sameMessage.result_json);}
  const prior=database.prepare('SELECT user_id,message_id,action,fingerprint,result_json FROM assistant_schedule_operations WHERE operation_id=?').get(input.operationId) as {user_id:string;message_id:string;action:string;fingerprint:string;result_json:string}|undefined;
  if(prior){if(prior.user_id!==input.userId||prior.message_id!==input.messageId||prior.action!=='create'||prior.fingerprint!==input.fingerprint)throw Error('ASSISTANT_OPERATION_ID_CONFLICT');return JSON.parse(prior.result_json);}
  const reminder=saveReminder({id:randomUUID(),name:input.name,classId:'',className:'',time:input.startAt??input.timeLabel??'时间待定',repeatRule:'一次性',status:'active',timeKind:input.timeKind,startAt:input.startAt,dueAt:input.startAt});
  const result={reminder,verified:true};
  database.prepare(`INSERT INTO assistant_schedule_operations(operation_id,user_id,message_id,action,reminder_id,fingerprint,result_json,created_at) VALUES(?,?,?,'create',?,?,?,?)`).run(input.operationId,input.userId,input.messageId,reminder.id,input.fingerprint,JSON.stringify(result),now());
  return result;
})();

const shanghaiDateTime = (date = new Date()) => {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
  return Object.fromEntries(parts.filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
};

export const isAssistantReminderTimeAvailable=(startAt:string)=>{
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(startAt))return false;
  const [date,time]=startAt.split('T');
  const [year,month,day]=date.split('-').map(Number);
  const [hour,minute]=time.split(':').map(Number);
  const calendarDate=new Date(Date.UTC(year,month-1,day,12));
  if(calendarDate.toISOString().slice(0,10)!==date||hour>23||minute>59)return false;
  const current=shanghaiDateTime();
  const currentDate=`${current.year}-${current.month}-${current.day}`;
  if(date<currentDate||(date===currentDate&&time<=`${current.hour}:${current.minute}`))return false;
  const weekday=calendarDate.getUTCDay()||7;
  const periods=listSchedulePeriods();
  const minutes=(v:string)=>{const [h,m]=v.split(':').map(Number);return h*60+m;};
  const at=minutes(time);
  const busy=listScheduleItems().some(item=>{
    if(item.day!==weekday||(item.scope??'teacher')!=='teacher')return false;
    const period=periods.find(p=>p.period===item.period);
    const bounds=item.time.match(/([0-9]{2}:[0-9]{2})/g);
    const start=bounds?.[0]??period?.startTime;
    const end=bounds?.[1]??period?.endTime;
    return start&&at>=minutes(start)&&at<(end?minutes(end):minutes(start)+45);
  });
  return !busy&&!listReminders().some(item=>item.status==='active'&&item.startAt?.slice(0,10)===date&&time>=item.startAt.slice(11,16)&&time<=(item.endAt??item.startAt).slice(11,16));
};

export const proposeAssistantReminderTime=(input:{proposalId:string;userId:string;sessionId:string;messageId:string;reminderId:string;startAt:string})=>database.transaction(()=>{
  if(!isAssistantReminderTimeAvailable(input.startAt))throw Error('ASSISTANT_REMINDER_TIME_UNAVAILABLE');
  const prior=database.prepare("SELECT * FROM assistant_schedule_proposals WHERE user_id=? AND session_id=? AND message_id=? AND reminder_id=? AND status='pending' ORDER BY created_at DESC LIMIT 1").get(input.userId,input.sessionId,input.messageId,input.reminderId) as {proposal_id:string;start_at:string}|undefined;
  if(prior){if(prior.start_at!==input.startAt)throw Error('ASSISTANT_PROPOSAL_ALREADY_PENDING');return {proposalId:prior.proposal_id,userId:input.userId,messageId:input.messageId,reminderId:input.reminderId,startAt:prior.start_at,status:'pending',sessionId:input.sessionId};}
  const reminder=listReminders().find(item=>item.id===input.reminderId);
  if(!reminder||reminder.status!=='active'||reminder.recurrence?.enabled)throw Error('ASSISTANT_REMINDER_NOT_FOUND');
  const updated=database.prepare('SELECT updated_at FROM timer_reminders WHERE id=?').get(reminder.id) as {updated_at:string}|undefined;
  if(!updated)throw Error('ASSISTANT_REMINDER_NOT_FOUND');
  const fingerprint=createHash('sha256').update(JSON.stringify(reminder)).digest('hex');
  const proposal={proposalId:input.proposalId,userId:input.userId,messageId:input.messageId,reminderId:reminder.id,expectedUpdatedAt:updated.updated_at,expectedFingerprint:fingerprint,startAt:input.startAt,name:reminder.name,status:'pending' as const,createdAt:now()};
  database.prepare(`INSERT INTO assistant_schedule_proposals(proposal_id,user_id,message_id,reminder_id,expected_updated_at,start_at,name,status,created_at,updated_at,session_id,expected_fingerprint) VALUES(?,?,?,?,?,?,?,'pending',?,?,?,?)`).run(proposal.proposalId,proposal.userId,proposal.messageId,proposal.reminderId,proposal.expectedUpdatedAt,proposal.startAt,proposal.name,proposal.createdAt,proposal.createdAt,input.sessionId,fingerprint);
  return {...proposal,sessionId:input.sessionId};
})();

export const proposeAssistantReminderCreation=(input:{proposalId:string;userId:string;sessionId:string;messageId:string;name:string;startAt?:string})=>database.transaction(()=>{
  if(input.startAt&&!isAssistantReminderTimeAvailable(input.startAt))throw Error('ASSISTANT_REMINDER_TIME_UNAVAILABLE');
  const prior=database.prepare("SELECT proposal_id AS proposalId,name,start_at AS startAt FROM assistant_schedule_proposals WHERE user_id=? AND session_id=? AND message_id=? AND expected_fingerprint='create' AND status='pending' ORDER BY created_at DESC LIMIT 1").get(input.userId,input.sessionId,input.messageId) as {proposalId:string;name:string;startAt:string}|undefined;
  if(prior){if(prior.name!==input.name||prior.startAt!==(input.startAt??''))throw Error('ASSISTANT_PROPOSAL_ALREADY_PENDING');return {...prior,status:'pending',reminderId:''};}
  database.prepare("INSERT INTO assistant_schedule_proposals(proposal_id,user_id,message_id,reminder_id,expected_updated_at,start_at,name,status,created_at,updated_at,session_id,expected_fingerprint) VALUES(?,?,?,'','',?,?,'pending',?,?,?,'create')").run(input.proposalId,input.userId,input.messageId,input.startAt??'',input.name,now(),now(),input.sessionId);
  return {proposalId:input.proposalId,name:input.name,startAt:input.startAt??'',status:'pending',reminderId:''};
})();

export const listAssistantReminderProposals=(userId:string,sessionId:string)=>database.prepare("SELECT proposal_id AS proposalId,reminder_id AS reminderId,name,start_at AS startAt,status FROM assistant_schedule_proposals WHERE user_id=? AND session_id=? AND status='pending' AND created_at>? ORDER BY created_at DESC LIMIT 5").all(userId,sessionId,new Date(Date.now()-30*60*1000).toISOString());

export const confirmAssistantReminderTime=(proposalId:string,userId:string,sessionId:string)=>database.transaction(()=>{
  const row=database.prepare('SELECT * FROM assistant_schedule_proposals WHERE proposal_id=? AND user_id=? AND session_id=?').get(proposalId,userId,sessionId) as {proposal_id:string;reminder_id:string;expected_updated_at:string;expected_fingerprint:string;start_at:string;status:string;created_at:string;name:string}|undefined;
  if(!row)throw Error('ASSISTANT_PROPOSAL_NOT_FOUND');
  if(row.status==='applied')return {status:'applied',reminder:listReminders().find(item=>item.id===row.reminder_id)};
  if(row.status!=='pending'||Date.now()-Date.parse(row.created_at)>30*60*1000||(row.start_at&&!isAssistantReminderTimeAvailable(row.start_at)))throw Error('ASSISTANT_PROPOSAL_STALE');
  if(row.expected_fingerprint==='create'){
    const result=createAssistantReminder({operationId:proposalId,userId,messageId:sessionId+':proposal:'+proposalId,fingerprint:createHash('sha256').update(JSON.stringify({name:row.name,startAt:row.start_at})).digest('hex'),name:row.name,timeKind:row.start_at?'point':'none',startAt:row.start_at||undefined});
    database.prepare("UPDATE assistant_schedule_proposals SET status='applied',reminder_id=?,updated_at=? WHERE proposal_id=?").run(result.reminder.id,now(),proposalId);
    return {status:'applied',reminder:result.reminder};
  }
  const current=database.prepare('SELECT updated_at FROM timer_reminders WHERE id=?').get(row.reminder_id) as {updated_at:string}|undefined;
  const old=listReminders().find(item=>item.id===row.reminder_id);
  if(!current||!old||current.updated_at!==row.expected_updated_at||createHash('sha256').update(JSON.stringify(old)).digest('hex')!==row.expected_fingerprint){database.prepare("UPDATE assistant_schedule_proposals SET status='stale',updated_at=? WHERE proposal_id=?").run(now(),proposalId);throw Error('ASSISTANT_PROPOSAL_STALE');}
  const reminder=saveReminder({...old,timeKind:'point',startAt:row.start_at,endAt:undefined,dueAt:row.start_at,time:row.start_at.replace('T',' ')});
  database.prepare("UPDATE assistant_schedule_proposals SET status='applied',updated_at=? WHERE proposal_id=? AND status='pending'").run(now(),proposalId);
  return {status:'applied',reminder};
})();

export const rejectAssistantReminderTime=(proposalId:string,userId:string,sessionId:string)=>database.transaction(()=>{
  const result=database.prepare("UPDATE assistant_schedule_proposals SET status='rejected',updated_at=? WHERE proposal_id=? AND user_id=? AND session_id=? AND status='pending'").run(now(),proposalId,userId,sessionId);
  if(!result.changes)throw Error('ASSISTANT_PROPOSAL_NOT_FOUND');
  return {status:'rejected'};
})();

export const getAssistantReminderProposalContext=(reminderId:string)=>{
  const reminder=listReminders().find(item=>item.id===reminderId&&item.status==='active');
  return reminder?{reminder,schedule:listScheduleItems(),periods:listSchedulePeriods()}:null;
};

export const saveReminderSeries = (input: TimerReminder): TimerReminder[] => database.transaction(() => {
  const currentRow = database.prepare('SELECT * FROM timer_reminders WHERE id = ?').get(input.id) as ReminderRow | undefined;
  if (!currentRow) throw new Error('REMINDER_NOT_FOUND');
  const current = toReminder(currentRow);
  if (!current.seriesId) return [saveReminderRecord(input)];
  const rows = database.prepare(`
    SELECT * FROM timer_reminders WHERE series_id = ? AND occurrence_number >= ? AND status = 'active'
    ORDER BY occurrence_number
  `).all(current.seriesId, current.occurrenceNumber ?? 1) as ReminderRow[];
  const delta = current.startAt && input.startAt ? parseLocal(input.startAt).getTime() - parseLocal(current.startAt).getTime() : 0;
  return rows.map((row) => {
    const occurrence = toReminder(row);
    if (occurrence.id === input.id) return saveReminderRecord(input);
    const shiftedStart = occurrence.startAt && delta ? formatLocal(new Date(parseLocal(occurrence.startAt).getTime() + delta)) : occurrence.startAt;
    const shiftedEnd = occurrence.endAt && delta ? formatLocal(new Date(parseLocal(occurrence.endAt).getTime() + delta)) : occurrence.endAt;
    return saveReminderRecord({
      ...occurrence,
      name: input.name, classId: input.classId, className: input.className,
      important: input.important, urgent: input.urgent, recurrence: input.recurrence,
      repeatRule: input.repeatRule, timeKind: input.timeKind,
      startAt: shiftedStart, endAt: shiftedEnd, dueAt: shiftedStart,
      time: displayReminderTime(input.timeKind, shiftedStart, shiftedEnd),
    });
  });
})();

export const saveReminders = (items: TimerReminder[]) => database.transaction(() => items.map(saveReminder))();

export const deleteReminder = (id: string) => database.prepare('DELETE FROM timer_reminders WHERE id = ?').run(id).changes > 0;
