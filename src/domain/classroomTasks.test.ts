/** @license SPDX-License-Identifier: Apache-2.0 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { countTaskParticipants, reduceTaskParticipant, type TaskEvent, type TaskParticipant } from './classroomTasks';
const participant = (id:number,result:TaskParticipant['result'],exempt=false):TaskParticipant => ({id:String(id),studentId:String(id),membershipId:String(id),name:'示例',studentNo:String(id),enrollmentStatus:'active',included:true,exempt,version:0,result,firstResult:result,currentEventId:null});
const event = (id:string,kind:TaskEvent['kind'],result:TaskEvent['result'],previousEventId:string|null=null,targetEventId:string|null=null):TaskEvent => ({id,kind,result,previousEventId,targetEventId,taskId:'task',participantId:'student',operationId:id,occurredAt:'2026-10-20T12:00:00Z',recordedAt:'2026-10-20T12:00:00Z',actorUserId:'teacher',source:'test',reason:''});
test('40 student completion scenario distinguishes unrecorded and explicit negative',() => {
  const people = Array.from({length:40},(_,i) => participant(i,i<36?'positive':i<38?'negative':null));
  assert.deepEqual(countTaskParticipants(people),{positive:36,negative:2,unrecorded:2,exempt:0,total:40,required:40,rate:.9});
  people[36].result='positive'; assert.equal(countTaskParticipants(people).rate,.925);
});
test('pass scenario excludes exempt student from denominator and all exempt is not applicable',() => {
  const people = Array.from({length:40},(_,i) => participant(i,i<32?'positive':i<38?'negative':null));
  people[38].exempt=true;
  assert.equal(countTaskParticipants(people).rate,32/39);
  people.forEach(item=>{item.exempt=true;}); assert.equal(countTaskParticipants(people).rate,null);
});
test('retests preserve first fact and retract restores preceding fact',() => {
  const events = [event('first','initial','negative'),event('again','retest','negative','first'),event('pass','retest','positive','again')];
  assert.deepEqual(reduceTaskParticipant(events),{result:'positive',currentEventId:'pass',firstResult:'negative'});
  events.push(event('undo','retract',null,'pass','pass'));
  assert.deepEqual(reduceTaskParticipant(events),{result:'negative',currentEventId:'again',firstResult:'negative'});
});
test('correction changes effective first result, and retract restores original fact',() => {
  const events = [event('first','initial','negative'),event('fix','correct','positive','first','first')];
  assert.deepEqual(reduceTaskParticipant(events),{result:'positive',currentEventId:'fix',firstResult:'positive'});
  events.push(event('undo','retract',null,'fix','fix'));
  assert.deepEqual(reduceTaskParticipant(events),{result:'negative',currentEventId:'first',firstResult:'negative'});
});
