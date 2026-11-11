import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {apply} from './official-teaching.mjs';
import {publishedSkillSource} from './official-skills.mjs';

test('preparation execution diagnostics do not change unrelated tool availability',async()=>{
 const server=createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;
  const body=JSON.parse(raw);
  const value=body.kind==='dsh-prompts'?{nodes:[{id:'skill:lesson-preparation',kind:'skill',enabled:true}]}
   :body.kind==='preparation-context'?(body.referenceIds.length?{references:[{id:'fixture'}]}:null)
   :body.kind==='acquire'?{budget:{steps:24,queries:48,timeoutMs:30000}}
   :body.kind==='personal-context'?{entries:[]}
   :body.kind==='materials-context'?{references:[]}
   :body.kind==='business-context'?{complete:true}
   :body.kind==='preparation-tool'?{taskId:'123e4567-e89b-42d3-a456-426614174000',baseRevision:42,status:'running',stage:body.input.stage,verification:{verified:true,action:'begin',taskStatus:'running',documentRevision:42,message:'任务已建立'}}
   :{};
  res.setHeader('content-type','application/json');res.end(JSON.stringify(value));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const oldEndpoint=process.env.QS_TOOL_ENDPOINT,oldToken=process.env.QS_TOOL_TOKEN;
 process.env.QS_TOOL_ENDPOINT=`http://127.0.0.1:${server.address().port}`;process.env.QS_TOOL_TOKEN='fixture';
 const handlers=new Map(),tools=new Map(),contexts=[];let guard;
 const ctx={
  systemPrompt:{context:definition=>{contexts.push(definition);return()=>{};}},
  on:(name,handler)=>handlers.set(name,handler),
  effect:run=>{run();},
  tools:{register:tool=>{tools.set(tool.name,tool);return()=>{};},guard:fn=>{guard=fn;return()=>{};}},
 };
 try{
  apply(ctx);
  const referenceTurn={agent:{id:'with-reference',cancel(){}},turn:1,messages:[{id:'user-with-reference',source:{kind:'user'},content:[{type:'text',text:'请修改[[青松教案:123e4567-e89b-42d3-a456-426614174000]]'}]}],signal:new AbortController().signal};
  const plainTurn={agent:{id:'plain',cancel(){}},turn:1,messages:[{id:'user-plain',source:{kind:'user'},content:[{type:'text',text:'你好'}]}],signal:new AbortController().signal};
  await handlers.get('agent/pre-step')(referenceTurn,async()=>'entered');
  await handlers.get('agent/pre-step')(plainTurn,async()=>'entered');
  const call=(id,name)=>guard({agent:{id},name,arguments:{action:'create'}});
  assert.equal(call('with-reference','qingsong_schedule'),undefined);
  assert.equal(call('with-reference','qingsong_memory'),undefined);
  assert.equal(call('plain','qingsong_schedule'),undefined);
  assert.equal(call('plain','qingsong_memory'),undefined);
  assert.equal(guard({agent:{id:'with-reference'},name:'skill',arguments:{name:'lesson-preparation'}}),undefined);
  await handlers.get('tools/post-execute')({agent:{id:'with-reference'},name:'skill',arguments:{name:'lesson-preparation'}},{isError:false,content:[]},async()=>({kind:'accept'}));
  const continuation=contexts.find(item=>item.name==='本轮备课连续状态').text({agent:{id:'with-reference'}});
  assert.equal(JSON.parse(continuation).loadedSkills[0].source,publishedSkillSource('lesson-preparation'));
  assert.match(guard({agent:{id:'with-reference'},name:'skill',arguments:{name:'lesson-preparation'}}),/已在本轮加载/);
  const preparation=tools.get('qingsong_preparation');
  await preparation.execute({action:'begin',stage:'读取资料'},{agent:{id:'with-reference'},callId:'begin',signal:new AbortController().signal});
  const resumed=JSON.parse(contexts.find(item=>item.name==='本轮备课连续状态').text({agent:{id:'with-reference'}}));
  assert.equal(resumed.toolStates.at(-1).taskId,'123e4567-e89b-42d3-a456-426614174000');
  assert.equal(resumed.toolStates.at(-1).baseRevision,42);
  assert.equal(resumed.toolStates.at(-1).status,'running');
  for(let step=1;step<24;step++)await handlers.get('agent/pre-step')(referenceTurn,async()=>'entered');
  await assert.rejects(handlers.get('agent/pre-step')(referenceTurn,async()=>'entered'),/本轮备课尝试次数已用完/);
  handlers.get('session/event')({id:'with-reference'},{type:'turn/end'});
  handlers.get('session/event')({id:'plain'},{type:'turn/end'});
 }finally{
  if(oldEndpoint===undefined)delete process.env.QS_TOOL_ENDPOINT;else process.env.QS_TOOL_ENDPOINT=oldEndpoint;
  if(oldToken===undefined)delete process.env.QS_TOOL_TOKEN;else process.env.QS_TOOL_TOKEN=oldToken;
  await new Promise(resolve=>server.close(resolve));
 }
});
