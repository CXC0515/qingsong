import assert from 'node:assert/strict';
import test from 'node:test';
import { hasDirectReminderIntent, reminderTimeFromText, reminderNameFromText, shanghaiDateAt, resolveReminderStartAt, hasScheduleTimeApproval, hasScheduleTimeRejection } from './scheduleAuthorization';

test('accepts explicit personal reminder requests', () => {
  assert.equal(hasDirectReminderIntent('明天下午三点提醒我交教案'), true);
  assert.equal(hasDirectReminderIntent('提醒我交教案'), true);
  assert.equal(hasDirectReminderIntent('记一下交教案'), true);
  assert.equal(hasDirectReminderIntent('不要忘了提醒我交教案'), true);
});

test('does not treat discussion, hypothetical, or negative wording as write authorization', () => {
  for (const text of ['是不是该提醒我交教案', '如果需要就提醒我交教案', '别提醒我交教案', '我不想让你提醒我交教案', '这件事不是要创建提醒']) {
    assert.equal(hasDirectReminderIntent(text), false, text);
  }
});

test('resolves explicit Shanghai dates at submission time and preserves incomplete times',()=>{
 const submitted=Date.parse('2026-11-09T15:59:00Z');
 assert.deepEqual(reminderTimeFromText('明天下午三点提醒我交教案',submitted),{date:'2026-11-10',time:'15:00'});
 assert.deepEqual(reminderTimeFromText('2026年11月12日上午九点半提醒我开会',submitted),{date:'2026-11-12',time:'09:30'});
 assert.deepEqual(reminderTimeFromText('明天下午提醒我交教案',submitted),{date:'2026-11-10',time:undefined});
 assert.deepEqual(reminderTimeFromText('周三下午三点提醒我交教案',submitted),{date:'2026-11-11',time:'15:00'});
 assert.deepEqual(reminderTimeFromText('下周一提醒我交教案',submitted),{date:'2026-11-16',time:undefined});
 assert.deepEqual(reminderTimeFromText('提醒我交教案',submitted),{date:undefined,time:undefined});
 assert.deepEqual(reminderTimeFromText('下午三点提醒我交教案',submitted),{date:undefined,time:'15:00'});
 assert.equal(shanghaiDateAt(submitted),'2026-11-09');
 assert.equal(reminderNameFromText('下午三点提醒我交教案'),'交教案');
 assert.equal(reminderNameFromText('明天下午三点提醒我交教案'),'交教案');
 assert.equal(reminderNameFromText('2026年11月12日上午九点半提醒我开会'),'开会');
 assert.equal(reminderNameFromText('2026-11-12 09:30提醒我开会'),'开会');
 assert.equal(reminderNameFromText('提醒我交教案'),'交教案');
 assert.equal(reminderNameFromText('麻烦你提醒我交教案'),'交教案');
 assert.equal(reminderNameFromText('提醒我交教案周报'),'交教案周报');
 assert.equal(resolveReminderStartAt('15:00',undefined,Date.parse('2026-11-09T06:59:00Z')),'2026-11-09T15:00');
 assert.throws(()=>resolveReminderStartAt('15:00',undefined,Date.parse('2026-11-09T07:00:00Z')),/SCHEDULE_TIME_PASSED/);
 assert.equal(resolveReminderStartAt('15:00','2026-11-10',Date.parse('2026-11-09T07:00:00Z')),'2026-11-10T15:00');
});

test('time approval must be unqualified and rejection must be explicit',()=>{
  for(const text of ['好','好的。','可以','就这个时间'])assert.equal(hasScheduleTimeApproval(text),true,text);
  for(const text of ['好的，不要设置','可以，但换个时间','同意吗','好的，改成明天','你觉得可以吗'])assert.equal(hasScheduleTimeApproval(text),false,text);
  assert.equal(hasScheduleTimeRejection('暂不设置'),true);assert.equal(hasScheduleTimeRejection('好'),false);
});
