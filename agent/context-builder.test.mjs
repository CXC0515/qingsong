import test from 'node:test';
import assert from 'node:assert/strict';
import {refreshContext,buildContext,recallQuery,contextGuidance} from './context-builder.mjs';
const human=(id,text)=>({id,source:{kind:'user'},content:[{type:'text',text}]});
test('same question retains snapshot; next human question refreshes with bounded human-only context',async()=>{
  const state={},messages=[human('a','我带初二语文'),{source:{kind:'assistant'},content:[{type:'text',text:'不要把此建议当事实'}]},human('b','按我的背景写')];
  let personal=0,materials=0;
  const input={messageId:'b',messages,loadPersonal:async query=>{personal++;assert.match(query,/初二/);assert.doesNotMatch(query,/建议/);return {entries:[],memoryStatus:'ready'};},loadMaterials:async()=>{materials++;return {references:[]};}};
  assert.equal(await refreshContext(state,input),true);const before=JSON.stringify(state.contextParts);
  assert.equal(await refreshContext(state,input),false);assert.equal(JSON.stringify(state.contextParts),before);
  assert.equal(personal,1);assert.equal(materials,1);
  await refreshContext(state,{...input,messageId:'c',messages:[...messages,human('c','现在换成初三')]});
  assert.equal(personal,2);assert.equal(materials,2);
  assert.ok(recallQuery(Array.from({length:20},(_,i)=>human(String(i),'字'.repeat(3000)))).length<=4000);
});
test('context drops redundant metadata and bounds rules, memories and material labels',()=>{
  const snapshot={guidance:'不重复注入',revision:'changing-time',entries:[{id:'r',kind:'rule',content:'简短回复'},...Array.from({length:10},(_,i)=>({id:String(i),kind:'memory',content:'字'.repeat(1000)}))]};
  const built=buildContext(snapshot,{references:Array.from({length:50},(_,i)=>({id:String(i),name:'字'.repeat(1000)}))});
  assert.match(built.rules,/简短回复/);assert.doesNotMatch(built.dynamic,/changing-time|不重复注入/);
  assert.equal(JSON.parse(built.dynamic).memories.length,6);assert.equal(JSON.parse(built.dynamic).references.length,20);
  assert.ok(built.dynamic.length<10000);assert.match(contextGuidance,/权限/);
});
