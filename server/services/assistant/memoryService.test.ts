import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const root=mkdtempSync(path.join(os.tmpdir(),'qs-mem0-test-'));process.env.APP_DATA_ROOT=root;
const {createWorkspaceContext,runWithWorkspace}=await import('../../context/workspaceContext');
const store=await import('./personalContext');
const service=await import('./memoryService');
service.setMemoryRelevanceForTests(async(_query,entries)=>entries.map(e=>e.id));
const {setMemoryClientFactoryForTests}=await import('./mem0Client');
const {memoryUserId}=await import('./memoryConfig');
const a=createWorkspaceContext('memory-user-a','memory-work-a','teacher'),b=createWorkspaceContext('memory-user-b','memory-work-b','teacher');
test('model empty creation ID is normalized; invented IDs still reject',()=>{
 const parsed=service.memoryActionsSchema.parse({changes:[{action:'add',id:'',content:'任教初二语文',evidence:'教初二语文'}]});
 assert.equal(parsed.changes[0].id,undefined);
 assert.equal(service.memoryActionsSchema.parse({changes:[{action:'delete',id:crypto.randomUUID(),content:'',evidence:'忘掉'}]}).changes[0].content,undefined);
 assert.throws(()=>service.memoryActionsSchema.parse({changes:[{action:'update',id:'invented',content:'任教初三',evidence:'初三'}]}));
});
for(const [key,value] of Object.entries({ENABLED:'true',LLM_MODEL:'fixture',LLM_BASE_URL:'http://127.0.0.1:1/v1',LLM_API_KEY:'fixture',EMBEDDING_MODEL:'fixture',EMBEDDING_BASE_URL:'http://127.0.0.1:1/v1',EMBEDDING_API_KEY:'fixture',EMBEDDING_DIMENSIONS:'3',QDRANT_URL:'http://127.0.0.1:1'}))process.env['QS_MEMORY_'+key]=value;
const buckets=new Map<string,Map<string,{id:string;memory:string;score:number}>>();
let lowScore=false,unavailable=false;
setMemoryClientFactoryForTests(async()=>{
  if(unavailable)throw Error('fixture unavailable');
  const user=memoryUserId();let bucket=buckets.get(user);if(!bucket){bucket=new Map();buckets.set(user,bucket);}const data=bucket;
  return {
    add:async(memory:string)=>{const hit={id:crypto.randomUUID(),memory,score:0.9};data.set(hit.id,hit);return [hit];},
    get:async(id:string)=>data.get(id)??null,
    search:async()=>[...data.values()].map(hit=>({...hit,score:lowScore?0.1:0.9})),
    update:async(id:string,memory:string)=>{assert.ok(data.has(id));data.set(id,{id,memory,score:0.9});},
    delete:async(id:string)=>{data.delete(id);},
  };
});
after(async()=>{await service.drainMemoryWorkers();store.closePersonalContext();setMemoryClientFactoryForTests();service.setMemoryPlannerForTests();service.setMemoryRelevanceForTests();rmSync(root,{recursive:true,force:true});});
test('human conversation automatically creates indexed background, semantic recall, correction and forgetting',async()=>{
  await runWithWorkspace(a,async()=>{
    service.setMemoryPlannerForTests(async text=>({changes:[{action:'add',content:'教师任教初二语文',evidence:text}]}));
    service.queueConversationMemory('我现在教初二语文',{type:'chat',sessionId:'s'},'m1');await service.drainMemoryWorkers();
    const first=store.listPersonalEntries().find(e=>e.kind==='memory')!;assert.ok(first);assert.equal(first.status,'active');
    const recall=await service.semanticPersonalContext('结合我的授课年级给建议');assert.ok(recall.entries.some(e=>e.id===first.id));
    service.setMemoryPlannerForTests(async text=>({changes:[{action:'update',id:first.id,content:'教师任教初三语文',evidence:text}]}));
    service.queueConversationMemory('现在换成初三语文了',{type:'chat',sessionId:'s'},'m2');await service.drainMemoryWorkers();
    assert.equal(store.listPersonalEntries().find(e=>e.id===first.id)?.content,'教师任教初三语文');
    assert.ok(!(await service.semanticPersonalContext('任教情况')).entries.some(e=>e.content.includes('初二')));
    service.setMemoryPlannerForTests(async text=>({changes:[{action:'delete',id:first.id,evidence:text}]}));
    service.queueConversationMemory('别再记我的任教年级',{type:'chat',sessionId:'s'},'m3');await service.drainMemoryWorkers();
    assert.ok(!(await service.semanticPersonalContext('任教情况')).entries.some(e=>e.id===first.id));
  });
});
test('migration preserves IDs; low scores, disabled/deleted versions and other users never enter context',async()=>{
  await runWithWorkspace(a,async()=>{
    const e=store.createPersonalEntry({operationId:crypto.randomUUID(),kind:'memory',content:'喜欢先看简短例子'});
    await service.semanticPersonalContext('怎么解释');assert.ok(store.memoryIndexRows().some(row=>row.entryId===e.id));
    lowScore=true;assert.equal((await service.semanticPersonalContext('天气')).entries.filter(e=>e.kind==='memory').length,0);lowScore=false;
    store.updatePersonalEntry(e.id,{operationId:crypto.randomUUID(),expectedVersion:e.version,status:'deleted'});
    assert.ok(!(await service.semanticPersonalContext('例子')).entries.some(x=>x.id===e.id));
  });
  await runWithWorkspace(b,async()=>assert.equal((await service.semanticPersonalContext('授课年级')).entries.length,0));
});
test('relevance filters unrelated memories, rejects invented IDs and honors concurrent forgetting',async()=>{
  await runWithWorkspace(a,async()=>{
    const entry=store.createPersonalEntry({operationId:crypto.randomUUID(),kind:'memory',content:'周末喜欢游泳'});
    try{
      service.setMemoryRelevanceForTests(async()=>[]);
      assert.equal((await service.semanticPersonalContext('上海天气')).entries.filter(e=>e.kind==='memory').length,0);
      service.setMemoryRelevanceForTests(async()=>[crypto.randomUUID()]);
      assert.equal((await service.semanticPersonalContext('任教情况')).memoryStatus,'unavailable');
      service.setMemoryRelevanceForTests(async()=>{
        store.updatePersonalEntry(entry.id,{operationId:crypto.randomUUID(),expectedVersion:entry.version,status:'deleted'});
        return [entry.id];
      });
      assert.ok(!(await service.semanticPersonalContext('周末爱好')).entries.some(e=>e.id===entry.id));
    }finally{service.setMemoryRelevanceForTests(async(_query,entries)=>entries.map(e=>e.id));}
  });
});
test('invalid evidence and unknown targets reject changes; source jobs are idempotent and failures stay visible',async()=>{
  await runWithWorkspace(b,async()=>{
    service.setMemoryPlannerForTests(async()=>({changes:[{action:'add',content:'编造事实',evidence:'根本没说过'}]}));
    service.queueConversationMemory('你好',{type:'chat',sessionId:'other'},'unique');await service.drainMemoryWorkers();
    assert.equal(store.listPersonalEntries().length,0);
    service.queueConversationMemory('你好',{type:'chat',sessionId:'other'},'unique');await service.drainMemoryWorkers();
    service.queueConversationMemory('你好',{type:'chat',sessionId:'other'},'unique');await service.drainMemoryWorkers();
    assert.equal((await service.semanticPersonalContext('你好')).memoryStatus,'failed');
    unavailable=true;assert.equal((await service.semanticPersonalContext('你好')).memoryStatus,'unavailable');unavailable=false;
  });
});
