/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const directory = mkdtempSync(path.join(tmpdir(), 'demo-schedule-repository-'));
process.env.ROSTER_DB_PATH = path.join(directory, 'roster.sqlite');
const repository = await import('./scheduleRepository');
const roster = await import('./rosterRepository');
const { closeRosterDatabase } = await import('../database/rosterDatabase');
const primaryClass = roster.createClass({ name: '七年级 5 班', grade: '七年级', term: '2026 秋季学期', headTeacher: '测试教师', status: 'active' });
after(() => { closeRosterDatabase(); rmSync(directory, { recursive: true, force: true }); });

test('persists schedules and reminder quadrant fields', () => {
  repository.saveScheduleItem({ id: 'schedule-1', day: 6, period: 1, title: '周末社团', classId: primaryClass.id, className: primaryClass.name, type: 'class', time: '08:00', scope: 'class', teacherName: '王老师' });
  repository.saveReminder({ id: 'reminder-1', name: '提交教案', classId: primaryClass.id, className: primaryClass.name, time: '周五 17:00', repeatRule: '一次性', status: 'active', important: true, urgent: false, timeKind: 'point', startAt: '2026-09-04T17:00' });
  assert.equal(repository.listScheduleItems()[0].day, 6);
  assert.equal(repository.listReminders()[0].important, true);
  assert.equal(repository.listReminders()[0].urgent, false);
  assert.equal(repository.listReminders()[0].timeKind, 'point');
  assert.equal(repository.listReminders()[0].startAt, '2026-09-04T17:00');
});

test('saves reminder batches transactionally', () => {
  const saved = repository.saveReminders([
    { id: 'reminder-2', name: '无时间事项', classId: '', className: '', time: '时间待定', repeatRule: '一次性', status: 'active', timeKind: 'none' },
    { id: 'reminder-3', name: '家长会', classId: primaryClass.id, className: primaryClass.name, time: '09:00 - 10:00', repeatRule: '一次性', status: 'active', timeKind: 'range', startAt: '2026-09-05T09:00', endAt: '2026-09-05T10:00' }
  ]);
  assert.equal(saved.length, 2);
  assert.equal(saved[1].timeKind, 'range');
});

test('completing a recurring event creates the next occurrence and reopening removes it', () => {
  const original = repository.saveReminder({ id: 'recurring-1', name: '周会', classId: '', className: '', time: '2026-09-07 14:00 - 15:00', repeatRule: '每 周', status: 'active', timeKind: 'range', startAt: '2026-09-07T14:00', endAt: '2026-09-07T15:00', recurrence: { enabled: true, unit: 'week', interval: 1, weekdays: [1], maxOccurrences: 3 } });
  repository.saveReminder({ ...original, status: 'completed' });
  const generated = repository.listReminders().find(item => item.generatedFromId === original.id);
  assert.equal(generated?.startAt, '2026-09-14T14:00');
  assert.equal(generated?.occurrenceNumber, 2);
  repository.saveReminder({ ...original, status: 'active' });
  assert.equal(repository.listReminders().some(item => item.generatedFromId === original.id), false);
});

test('editing a recurring event can update the current and future occurrence', () => {
  const original = repository.saveReminder({ id: 'recurring-series', name: '教研会', classId: '', className: '', time: '2026-09-08 14:00', repeatRule: '每 周', status: 'active', timeKind: 'point', startAt: '2026-09-08T14:00', recurrence: { enabled: true, unit: 'week', interval: 1, weekdays: [2], maxOccurrences: 4 } });
  repository.saveReminder({ ...original, status: 'completed' });
  const future = repository.listReminders().find(item => item.generatedFromId === original.id)!;
  const changed = repository.saveReminderSeries({ ...future, name: '联合教研会', startAt: '2026-09-15T15:00', time: '2026-09-15 15:00' });
  assert.equal(changed[0].name, '联合教研会');
  assert.equal(changed[0].startAt, '2026-09-15T15:00');
  assert.equal(repository.listReminders().find(item => item.id === original.id)?.name, '教研会');
});

test('persists the school-wide period timetable', () => {
  assert.equal(repository.listSchedulePeriods()[0].startTime, '08:00');
  repository.saveSchedulePeriods([
    { period: 1, label: '早读', startTime: '07:40', endTime: '08:20' },
    { period: 2, label: '第一节', startTime: '08:30', endTime: '09:15' }
  ]);
  const saved = repository.saveSchedulePeriods([{ period: 1, label: '早读', startTime: '07:40', endTime: '08:20' }]);
  assert.equal(saved.length, 1);
  assert.deepEqual(saved[0], { period: 1, label: '早读', startTime: '07:40', endTime: '08:20' });
});

test('assistant reminders are idempotent and proposed times require the same user and session to confirm',()=>{
 const created=repository.createAssistantReminder({operationId:'op-assistant-1',userId:'teacher-1',messageId:'message-1',fingerprint:'request-1',name:'提交教案',timeKind:'none'});
 assert.equal(created.reminder.timeKind,'none');
 assert.equal(repository.createAssistantReminder({operationId:'op-assistant-1',userId:'teacher-1',messageId:'message-1',fingerprint:'request-1',name:'提交教案',timeKind:'none'}).reminder.id,created.reminder.id);
 assert.equal(repository.createAssistantReminder({operationId:'op-assistant-retry',userId:'teacher-1',messageId:'message-1',fingerprint:'request-1',name:'提交教案',timeKind:'none'}).reminder.id,created.reminder.id);
 assert.throws(()=>repository.createAssistantReminder({operationId:'op-assistant-conflict',userId:'teacher-1',messageId:'message-1',fingerprint:'different-request',name:'另一事项',timeKind:'none'}),/OPERATION_ID_CONFLICT/);
 const tomorrow=new Date();const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(tomorrow);const dateParts=Object.fromEntries(parts.filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));const candidate=new Date(Date.UTC(Number(dateParts.year),Number(dateParts.month)-1,Number(dateParts.day)+7,12));const candidateDate=candidate.toISOString().slice(0,10);const weekday=candidate.getUTCDay()||7;
 repository.saveSchedulePeriods([{period:4,label:'第四节',startTime:'15:00',endTime:'15:40'},{period:5,label:'第五节',startTime:'15:50',endTime:'16:35'}]);
 repository.saveScheduleItem({id:'assistant-evidence',day:weekday,period:4,title:'教研课',classId:'',className:'',type:'class',time:'15:00 - 15:40',scope:'teacher',teacherName:''});
 assert.throws(()=>repository.proposeAssistantReminderTime({proposalId:'proposal-busy',userId:'teacher-1',sessionId:'session-1',messageId:'message-1',reminderId:created.reminder.id,startAt:candidateDate+'T15:00'}),/TIME_UNAVAILABLE/);
 const proposalInput={proposalId:'proposal-1',userId:'teacher-1',sessionId:'session-1',messageId:'message-1',reminderId:created.reminder.id,startAt:candidateDate+'T15:50'};
 const proposal=repository.proposeAssistantReminderTime(proposalInput);
 const repeated=repository.proposeAssistantReminderTime({...proposalInput,proposalId:'proposal-retry'});
 assert.equal(repeated.proposalId,proposal.proposalId);
 assert.throws(()=>repository.proposeAssistantReminderTime({...proposalInput,proposalId:'proposal-conflict',startAt:candidateDate+'T15:00'}),/TIME_UNAVAILABLE/);
 assert.equal(repository.listReminders().find(item=>item.id===created.reminder.id)?.timeKind,'none');
 assert.throws(()=>repository.confirmAssistantReminderTime(proposal.proposalId,'teacher-1','other-session'),/NOT_FOUND/);
 assert.deepEqual(repository.rejectAssistantReminderTime(proposal.proposalId,'teacher-1','session-1'),{status:'rejected'});
 assert.equal(repository.listReminders().find(item=>item.id===created.reminder.id)?.timeKind,'none');
 const second=repository.proposeAssistantReminderTime({...proposalInput,proposalId:'proposal-2'});
 const applied=repository.confirmAssistantReminderTime(second.proposalId,'teacher-1','session-1');
 assert.equal(applied.status,'applied');assert.equal(applied.reminder.startAt,candidateDate+'T15:50');
 assert.equal(repository.confirmAssistantReminderTime(second.proposalId,'teacher-1','session-1').reminder.startAt,candidateDate+'T15:50');
});

test('assumed creation is only a proposal until accepted, and refusal creates nothing',()=>{
 const before=repository.listReminders().length;
 const proposed=repository.proposeAssistantReminderCreation({proposalId:'assumed-create',userId:'teacher-1',sessionId:'session-create',messageId:'m-create',name:'备课安排'});
 assert.equal(repository.listReminders().length,before);
 const saved=repository.confirmAssistantReminderTime(proposed.proposalId,'teacher-1','session-create');
 assert.equal(saved.reminder.name,'备课安排');assert.equal(saved.reminder.timeKind,'none');
 assert.equal(repository.listReminders().length,before+1);
 repository.confirmAssistantReminderTime(proposed.proposalId,'teacher-1','session-create');
 assert.equal(repository.listReminders().length,before+1);
 const rejected=repository.proposeAssistantReminderCreation({proposalId:'assumed-reject',userId:'teacher-1',sessionId:'session-create',messageId:'m-reject',name:'另一个安排'});
 repository.rejectAssistantReminderTime(rejected.proposalId,'teacher-1','session-create');
 assert.equal(repository.listReminders().length,before+1);
 assert.throws(()=>repository.confirmAssistantReminderTime(rejected.proposalId,'teacher-1','session-create'),/STALE/);
});
