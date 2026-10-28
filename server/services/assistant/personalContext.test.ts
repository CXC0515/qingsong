import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync,existsSync} from 'node:fs';
import os from 'node:os';import path from 'node:path';
const root=mkdtempSync(path.join(os.tmpdir(),'qs-personal-'));
process.env.APP_DATA_ROOT=root;
const {createWorkspaceContext,runWithWorkspace}=await import('../../context/workspaceContext');
const store=await import('./personalContext');
const {createProductSnapshot,verifyProductSnapshot,restoreProductSnapshot}=await import('../operations/productSnapshot');
const a=createWorkspaceContext('teacher-a','workspace-a','teacher'),otherWorkspace=createWorkspaceContext('teacher-a','workspace-c','teacher'),b=createWorkspaceContext('teacher-b','workspace-b','teacher');
after(()=>{store.closePersonalContext();rmSync(root,{recursive:true,force:true});});
const operationId=()=>crypto.randomUUID();
test('one user shares one database across workspaces; another user cannot read or change it',()=>{
 let entry!:ReturnType<typeof store.createPersonalEntry>;
 runWithWorkspace(a,()=>{
  const input={operationId:operationId(),kind:'rule',content:'教案先列教学目标'};
  entry=store.createPersonalEntry(input);
  assert.equal(store.createPersonalEntry(input).id,entry.id);
  assert.throws(()=>store.createPersonalEntry({...input,content:'不同内容'}),/操作编号/);
  assert.equal(store.personalHistory(entry.id).length,1);
 });
 assert.equal(runWithWorkspace(a,store.personalContextPath),runWithWorkspace(otherWorkspace,store.personalContextPath));
 assert.equal(runWithWorkspace(otherWorkspace,store.listPersonalEntries)[0].id,entry.id);
 runWithWorkspace(b,()=>{
  assert.deepEqual(store.listPersonalEntries(),[]);
  assert.throws(()=>store.updatePersonalEntry(entry.id,{operationId:operationId(),expectedVersion:1,status:'deleted'}),/找不到/);
  assert.throws(()=>store.personalHistory(entry.id),/找不到/);
 });
 assert.throws(()=>store.listPersonalEntries(),/WORKSPACE_CONTEXT_REQUIRED/);
});
test('candidate approval, version conflict, disable, expiry and deletion affect the next recall',()=>{
 runWithWorkspace(a,()=>{
  const proposed=store.personalTool({action:'propose',kind:'memory',content:'这学期关注课堂参与度'},{type:'chat',sessionId:'sample'},null) as any;
  assert.equal(proposed.entry.status,'candidate');
  assert.ok(!JSON.stringify(store.recallPersonalContext('参与度')).includes('这学期关注课堂参与度'));
  let e=store.updatePersonalEntry(proposed.entry.id,{operationId:operationId(),expectedVersion:1,status:'active'});
  assert.match(JSON.stringify(store.recallPersonalContext('参与度')),/这学期关注课堂参与度/);
  assert.throws(()=>store.updatePersonalEntry(e.id,{operationId:operationId(),expectedVersion:1,content:'过期覆盖'}),/已在别处修改/);
  e=store.updatePersonalEntry(e.id,{operationId:operationId(),expectedVersion:e.version,status:'disabled'});
  assert.ok(!JSON.stringify(store.recallPersonalContext('参与度')).includes('这学期关注课堂参与度'));
  e=store.updatePersonalEntry(e.id,{operationId:operationId(),expectedVersion:e.version,status:'active'});
  e=store.updatePersonalEntry(e.id,{operationId:operationId(),expectedVersion:e.version,status:'deleted'});
  assert.ok(!JSON.stringify(store.recallPersonalContext('参与度')).includes('这学期关注课堂参与度'));
  assert.throws(()=>store.updatePersonalEntry(e.id,{operationId:operationId(),expectedVersion:e.version,status:'active'}),/找不到/);
  const again=store.personalTool({action:'propose',content:e.content},{type:'chat'},null) as any;
  assert.equal(again.entry.status,'candidate','history alone must not reactivate deleted memory');
  const expired=store.createPersonalEntry({operationId:operationId(),kind:'memory',content:'过期候选',expiresAt:'2020-01-01T00:00:00Z'},{type:'chat'},'candidate');
  assert.equal(store.listPersonalEntries().find(e=>e.id===expired.id)?.status,'expired');
  assert.throws(()=>store.updatePersonalEntry(expired.id,{operationId:operationId(),expectedVersion:1,status:'active'}),/有效期/);
 });
});
test('only exact human consent activates or forgets; inferred changes stay pending',()=>{
 runWithWorkspace(otherWorkspace,()=>{
  const inferred=store.personalTool({action:'propose',kind:'rule',content:'使用表格'},{type:'chat'},'个人规则：不要使用表格') as any;
  assert.equal(inferred.entry.status,'candidate');
  const exact=store.personalTool({action:'propose',content:'长期目标是阅读习惯'},{type:'chat',sessionId:'s'},'记住：长期目标是阅读习惯') as any;
  assert.equal(exact.entry.status,'active');
  assert.equal((store.personalTool({action:'forget',content:exact.entry.content},{type:'chat'},'继续刚才的话题') as any).code,'CONFIRM_REQUIRED');
  assert.equal((store.personalTool({action:'forget',content:exact.entry.content},{type:'chat'},'忘记：长期目标是阅读习惯') as any).deleted,1);
  assert.throws(()=>store.personalTool({action:'propose',content:'注入',confirmed:true},{type:'chat'},null));
 });
});
test('user memory survives restart, online product backup and restore',async()=>{
 const original=runWithWorkspace(a,()=>store.createPersonalEntry({operationId:operationId(),kind:'memory',content:'跨会话备份验证'}));
 store.closePersonalContext();
 assert.ok(runWithWorkspace(otherWorkspace,store.listPersonalEntries).some(e=>e.id===original.id));
 mkdirSync(path.join(root,'workspaces'),{recursive:true});
 const snapshot=await createProductSnapshot(root,path.join(root,'backup-test'));
 assert.equal(snapshot.sqliteFiles.filter(p=>p.endsWith('assistant-context.sqlite')).length,2);
 await verifyProductSnapshot(path.join(root,'backup-test'));
 const restored=path.join(root,'restore-test');
 await restoreProductSnapshot(path.join(root,'backup-test'),restored);
 const relative=path.relative(root,runWithWorkspace(a,store.personalContextPath));
 assert.ok(existsSync(path.join(restored,relative)));
 const {default:Database}=await import('better-sqlite3');const d=new Database(path.join(restored,relative),{readonly:true});
 assert.equal((d.prepare('SELECT content FROM personal_entries WHERE id=?').get(original.id) as {content:string}).content,original.content);d.close();
});

test('instruction document saves atomically, preserves timed/candidate rules and reconciles retries',()=>{
 const owner=createWorkspaceContext('document-owner','doc-workspace','teacher');
 runWithWorkspace(owner,()=>{
  const first=store.createPersonalEntry({operationId:operationId(),kind:'rule',content:'旧指令一'});
  store.createPersonalEntry({operationId:operationId(),kind:'rule',content:'旧指令二'});
  const timed=store.createPersonalEntry({operationId:operationId(),kind:'rule',content:'限期规则',expiresAt:new Date(Date.now()+86400000).toISOString()});
  const candidate=store.createPersonalEntry({operationId:operationId(),kind:'rule',content:'待确认规则'},{type:'chat'},'candidate');
  const before=store.readInstructionDocument();assert.match(before.content,/旧指令/);assert.ok(!before.content.includes('限期'));
  const input={operationId:operationId(),expectedRevision:before.revision,content:'# 指令\n'+ '文'.repeat(1100)};
  const saved=store.saveInstructionDocument(input);assert.equal(saved.content,input.content);assert.deepEqual(store.saveInstructionDocument(input),saved);
  assert.equal(store.listPersonalEntries().find(e=>e.id===timed.id)?.version,1);
  assert.equal(store.listPersonalEntries().find(e=>e.id===candidate.id)?.status,'candidate');
  assert.ok(store.personalHistory(first.id).some(e=>e.content==='旧指令一'));
  assert.throws(()=>store.saveInstructionDocument({...input,operationId:operationId(),content:'覆盖'}),/已在别处修改/);
  assert.throws(()=>store.saveInstructionDocument({...input,content:'复用编号不同内容'}),/操作编号/);
  assert.throws(()=>store.saveInstructionDocument({operationId:operationId(),expectedRevision:saved.revision,content:'文'.repeat(3000)}),/最多/);
  assert.deepEqual(store.readInstructionDocument(),saved); // failed merge rolls back retired rows too
  const cleared=store.saveInstructionDocument({operationId:operationId(),expectedRevision:saved.revision,content:''});assert.equal(cleared.content,'');
  assert.ok(store.recallPersonalContext('').entries.some(e=>e.id===timed.id));
 });
 assert.equal(runWithWorkspace(b,store.readInstructionDocument).content,'');
});
