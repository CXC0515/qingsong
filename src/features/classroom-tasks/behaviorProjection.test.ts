import test from 'node:test';
import assert from 'node:assert/strict';
import {behaviorProjection,type BehaviorIntent} from './behaviorProjection';
import type {BehaviorEvent,BehaviorInput} from '../../domain/classroomBehavior';
import type {RecordingJob} from './recordingQueue';
const input:BehaviorIntent={operationId:'',studentId:'s1',classId:'c1',kind:'participation',note:'',occurredDate:'2026-10-21'};
const event:BehaviorEvent={...input,id:'e1',operationId:'op1',studentName:'学生',recordedAt:'2026-10-21T01:00:00Z',actorUserId:'u1',targetId:null,retracted:false};
const job=(id:string,intent:BehaviorIntent=input):RecordingJob<BehaviorIntent,BehaviorInput>=>({id,label:'学生',intent,status:'unknown'});
test('ten unsynced occurrences immediately count ten; undo before ack subtracts once',()=>{
 const jobs=Array.from({length:10},(_,i)=>job('op'+i));assert.equal(behaviorProjection([],jobs).get('s1'),10);
 jobs.push(job('undo',{...input,targetOperationId:'op1'}));assert.equal(behaviorProjection([],jobs).get('s1'),9);
});
test('reload with a lost acknowledgement does not double an event already returned by the server',()=>{
 assert.equal(behaviorProjection([event],[job('op1')]).get('s1'),1);
 assert.equal(behaviorProjection([event],[job('op1'),job('op2')]).get('s1'),2);
});
test('a pending inverse does not subtract a server-confirmed retraction twice',()=>{
 const other={...event,id:'e2',operationId:'op2'};
 assert.equal(behaviorProjection([{...event,retracted:true},other],[job('undo',{...input,targetOperationId:'op1'})]).get('s1'),1);
});
