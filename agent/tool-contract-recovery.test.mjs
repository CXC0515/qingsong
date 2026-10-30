import test from 'node:test';import assert from 'node:assert/strict';
import {executeCapability,ReadToolFailure,httpReadFailure} from './tool-contract-recovery.mjs';
import {assistantObjects,capabilityToolParameters,capabilityArgumentIssues} from '../src/domain/assistantCapabilityDefinitions.mjs';
const exec=id=>({callId:id,signal:new AbortController().signal});
test('model schemas enumerate real types, explain schedule/reminder, and carry nested requirements',()=>{
 for(const action of ['discover','search']){
  const schema=capabilityToolParameters(action);assert.deepEqual(schema.type.enum,Object.keys(assistantObjects));assert.match(schema.type.description,/schedule只查课程.*reminder查待办/);
 }
 const read=capabilityToolParameters('read');assert.equal(read.ref.properties.id.required,true);assert.equal(read.ref.properties.type.required,true);
 assert.equal(read.offset.type,'integer');assert.match(read.limit.description,/最大50/);
 for(const args of [{type:'日程'},{type:'reminders'},{type:'unknown'}])assert.equal(capabilityArgumentIssues('discover',args)[0].field,'type');
 assert.deepEqual(capabilityArgumentIssues('discover',{}),[]);
});
test('bad type is actionable, never silently translated, and identical retry does not reach service',async()=>{
 const state={queries:0};let calls=0;const run=(args,id)=>executeCapability({state,action:'discover',args,exec:exec(id),execute:()=>{calls++;return 'ok';}});
 await assert.rejects(run({type:'日程'},'1'),error=>{assert.equal(error.failure.code,'INVALID_QUERY');assert.equal(error.failure.issues[0].field,'type');assert.match(error.message,/schedule.*reminder/);assert.doesNotMatch(error.message,/日期/);return true;});
 assert.equal(calls,0);
 await assert.rejects(run({type:'日程'},'2'),error=>error.failure.code==='REPEATED_TOOL_FAILURE');assert.equal(calls,0);
 assert.equal(await run({},'3'),'ok');assert.equal(calls,1);
});
test('only a changed argument can retry a parameter failure, canonical key ordering cannot bypass protection',async()=>{
 const state={queries:0};let calls=0;
 const run=(args,id)=>executeCapability({state,action:'search',args,exec:exec(id),execute:()=>{calls++;throw new ReadToolFailure(httpReadFailure({code:'INVALID_FILTER',message:'不支持filters.status',recovery:'correct_arguments'},400));}});
 await assert.rejects(run({type:'resource',filters:{status:'active'},query:'sample'},'1'));
 await assert.rejects(run({query:'sample',filters:{status:'active'},type:'resource'},'2'),error=>error.failure.code==='REPEATED_TOOL_FAILURE');assert.equal(calls,1);
 await assert.rejects(run({type:'resource',query:'sample'},'3'));assert.equal(calls,2);
});
test('temporary errors allow one explicit retry; permission/data failure stops all reads in the turn',async()=>{
 const state={queries:0};let calls=0;
 const run=id=>executeCapability({state,action:'discover',args:{},exec:exec(id),execute:()=>{calls++;throw new ReadToolFailure(httpReadFailure({message:'暂不可用'},503));}});
 await assert.rejects(run('1'));await assert.rejects(run('2'));await assert.rejects(run('3'),error=>error.failure.code==='REPEATED_TOOL_FAILURE');assert.equal(calls,2);
 for(const code of ['AUTH_EXPIRED','ACCESS_DENIED','DATA_CORRUPT','DATA_READ_FAILED']){
  const turn={queries:0};let requests=0;
  await assert.rejects(executeCapability({state:turn,action:'discover',args:{},exec:exec(code),execute:()=>{requests++;throw new ReadToolFailure(httpReadFailure({code,message:'需停止'},400));}}));
  await assert.rejects(executeCapability({state:turn,action:'search',args:{type:'class'},exec:exec(code+'2'),execute:()=>{requests++;return 'must-not-run';}}));assert.equal(requests,1);
 }
});
test('field errors distinguish date, limit, missing ref, unknown field and are counted in the shared budget',async()=>{
 for(const [action,args,field] of [['search',{type:'reminder',filters:{from:'2026-02-30',to:'2026-03-01'}},'filters.from'],['search',{type:'reminder',limit:51},'limit'],['read',{ref:{type:'reminder'}},'ref.id'],['discover',{type:'reminder',workspaceId:'forged'},'workspaceId']]){
  const state={queries:0};await assert.rejects(executeCapability({state,action,args,exec:exec(field),execute:()=>assert.fail('must not execute')}),error=>error.failure.issues.some(issue=>issue.field===field));assert.equal(state.queries,1);
 }
 const exhausted={queries:12};await assert.rejects(executeCapability({state:exhausted,action:'discover',args:{},exec:exec('budget'),execute:()=>assert.fail()}),error=>error.failure.code==='TOOL_BUDGET_EXHAUSTED');
});
test('cancelled reads do not execute and a successful retry clears only its own failure episode',async()=>{
 let calls=0;const cancelled={queries:0};
 await assert.rejects(executeCapability({state:cancelled,action:'discover',args:{},exec:{callId:'cancel',signal:AbortSignal.abort()},execute:()=>{calls++;}}),error=>error.failure.code==='TURN_CANCELLED');assert.equal(calls,0);
 const state={queries:0};let fail=true;
 const run=id=>executeCapability({state,action:'discover',args:{},exec:exec(id),execute:()=>{calls++;if(fail)throw new ReadToolFailure(httpReadFailure({},503));return 'ok';}});
 await assert.rejects(run('first'));fail=false;assert.equal(await run('retry'),'ok');fail=true;
 await assert.rejects(run('new-episode'));await assert.rejects(run('new-retry'));await assert.rejects(run('blocked'),error=>error.failure.code==='REPEATED_TOOL_FAILURE');assert.equal(calls,4);
});
