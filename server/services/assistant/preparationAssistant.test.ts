import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, realpath, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { closeResourceDatabase } from '../../database/resourceDatabase';
import { materialPoolRepository } from '../../repositories/materialPoolRepository';
import { runWithWorkspace, type WorkspaceContext } from '../../context/workspaceContext';
import { closePreparationDatabase } from '../../database/preparationDatabase';
import {preparationRepository} from '../../repositories/preparationRepository';
import * as prep from '../preparation/preparationService';
import { preparationAssistantTool, resolvePreparationTarget as resolveNativeTarget, stopSessionTasks, preparationSavedOutcome } from './preparationAssistant';
import { readPreparation } from './capabilities/preparation';
import type { RichDocument } from '../../../src/domain/document';

import {registerPreparationReferences} from "./preparationReferences";
import {subscribePreparationEditing,confirmDocumentEditing} from '../preparation/preparationEditing';
async function resolvePreparationTarget(input:any,native:any){const target=await resolveNativeTarget(input,native);const sessionId=input.sessionId??"test-session-"+input.preparationId;await native("session/create",{sessionId});if(target.reference)registerPreparationReferences(sessionId,[target.reference.id],[target.reference.id]);return {...target,sessionId};}
const root = await mkdtemp(path.join(tmpdir(), 'qs-preparation-assistant-'));
const context: WorkspaceContext = { userId: 'teacher-helper', workspaceId: 'workspace-helper', role: 'teacher', root, dataDirectory: path.join(root, 'data'), uploadDirectory: path.join(root, 'uploads') };
after(async () => { closePreparationDatabase(); closeResourceDatabase(); await rm(root, {recursive:true,force:true}); });
const op = () => randomUUID();
const paragraph = (id: string, text: string) => ({type:'paragraph',attrs:{id},content:[{type:'text',text}]});
const document = (first = '原文第一段', second = '原文第二段'): RichDocument => ({type:'doc',content:[paragraph('paragraph-first',first),paragraph('paragraph-second',second)]});
function fixture() {
  const detail = prep.createPreparation({title:'助手测试',operationId:op()});
  const id = detail.preparation.id, doc = prep.saveDocument(id,detail.documents[0].id,{expectedRevision:1,operationId:op(),content:document()});
  return {id,doc};
}
function nativeFixture() {
  const calls: string[] = [], sessions = new Set<string>();
  return {calls,sessions,call:async (method: string, request: any) => {
    calls.push(method);
    if (method === 'workspace/create') return {workspace:{workspaceId:'native-preparation-workspace'}};
    if (method === 'session/create') { sessions.add(request.sessionId); return {sessionId:request.sessionId}; }
    if (method === 'session/projections') return sessions.has(request.sessionId) ? {sessionId:request.sessionId} : null;
    return {};
  }};
}
test('begin captures the revision after every open editor saves, then locks manual writes',()=>runWithWorkspace(context,async()=>{
 const {id,doc}=fixture(),native=nativeFixture();
 const target=await resolvePreparationTarget({mode:'preparation',preparationId:id,documentId:doc.id},native.call);
 const off=subscribePreparationEditing(id,'visible-editor',event=>{
  if(event.type!=='prepare')return;
  prep.saveDocument(id,doc.id,{expectedRevision:doc.revision,operationId:op(),content:document('刚输入的内容')});
  confirmDocumentEditing(id,doc.id,event.requestId!,'visible-editor',true);
 });
 try{
  const task=await preparationAssistantTool(target.sessionId!,{action:'begin'},'修改',undefined,'save-handshake') as any;
  assert.equal(task.result.baseRevision,doc.revision+1);
  assert.throws(()=>prep.saveDocument(id,doc.id,{expectedRevision:doc.revision+1,operationId:op(),content:document('意外覆盖')}),/AI 正在修改/);
  stopSessionTasks(target.sessionId!,'cancelled',undefined,'save-handshake');
  assert.equal(prep.getDocument(id,doc.id).content.content[0].content?.[0].text,'刚输入的内容');
 }finally{off();}
}));
test('selection remains usable after unrelated edits but refuses changed selected text',()=>runWithWorkspace(context,async()=>{
 const {id,doc}=fixture(),native=nativeFixture();
 const target=await resolvePreparationTarget({mode:'preparation',preparationId:id,documentId:doc.id,selection:{blockIds:['paragraph-first'],text:'原文第一段'}},native.call);
 prep.saveDocument(id,doc.id,{expectedRevision:doc.revision,operationId:op(),content:document('原文第一段','第二段改了')});
 const task=await preparationAssistantTool(target.sessionId!,{action:'begin'},'修改选区',undefined,'selection-latest') as any;
 assert.deepEqual(task.result.selection.blockIds,['paragraph-first']);
 stopSessionTasks(target.sessionId!,'cancelled',undefined,'selection-latest');
 prep.saveDocument(id,doc.id,{expectedRevision:doc.revision+1,operationId:op(),content:document('第一段也改了')});
 await assert.rejects(preparationAssistantTool(target.sessionId!,{action:'begin'},'修改选区',undefined,'selection-changed'),/选中的原文已经变化/);
}));

test('readback reports persisted revision, session-owned candidates and tasks without writing', async () => runWithWorkspace(context,async () => {
  const {id,doc} = fixture(), native = nativeFixture();
  const target = await resolvePreparationTarget({mode:'preparation',preparationId:id,documentId:doc.id},native.call);
  const task:any = await preparationAssistantTool(target.sessionId!,{action:'begin'},'修改');
  const result:any = await preparationAssistantTool(target.sessionId!,{action:'propose',taskId:task.id,baseRevision:doc.revision,operationId:op(),summary:'修改',content:JSON.stringify(document('候选'))},'修改');
  const outcome = preparationSavedOutcome(target.sessionId!);
  assert.equal(outcome.bound,true);
  if (outcome.bound) {assert.equal(outcome.revision,doc.revision); assert.equal(outcome.pending,1); assert.equal(outcome.applied,0);}
  prep.applyProposal(id,result.proposalId,{operationId:op()});
  assert.equal(preparationSavedOutcome(target.sessionId!).bound,true);
  assert.equal((preparationSavedOutcome(target.sessionId!) as any).revision,doc.revision+1);
  await runWithWorkspace({...context,userId:'other-owner'},async () => assert.deepEqual(preparationSavedOutcome(target.sessionId!),{bound:false}));
}));

test('execution stop readback distinguishes an interrupted task from a saved pending candidate', async () => runWithWorkspace(context,async () => {
  const {id,doc}=fixture(),native=nativeFixture();
  const target=await resolvePreparationTarget({mode:'preparation',preparationId:id,documentId:doc.id},native.call);
  const candidateTask:any=await preparationAssistantTool(target.sessionId!,{action:'begin',stage:'生成建议'},'修改第一段');
  await preparationAssistantTool(target.sessionId!,{action:'propose',taskId:candidateTask.taskId,baseRevision:doc.revision,operationId:op(),summary:'第一段候选',content:JSON.stringify(document('候选第一段'))},'修改第一段');
  const unfinished:any=await preparationAssistantTool(target.sessionId!,{action:'begin',stage:'核对后续内容'},'继续完善');
  stopSessionTasks(target.sessionId!,'interrupted','本轮步数已用完，任务未完成。');

  const outcome=preparationSavedOutcome(target.sessionId!);
  assert.equal(outcome.bound,true);
  if(outcome.bound){
    assert.equal(outcome.pending,1);
    assert.equal(outcome.applied,0);
    assert.ok(outcome.tasks.some(task=>task.status==='interrupted'&&task.stage==='核对后续内容'));
    assert.ok(outcome.tasks.some(task=>task.status==='completed'&&task.proposalStatus==='pending'));
  }
  assert.equal(prep.getTask(id,unfinished.taskId).status,'interrupted');
  assert.equal(prep.listProposals(id).length,1);
  assert.equal(prep.getDocument(id,doc.id).revision,doc.revision);
}));

test('selected paragraphs are a persisted task boundary; a later navigation cannot broaden an ongoing task', async () => runWithWorkspace(context,async () => {
  const {id,doc} = fixture(), native = nativeFixture();
  const target = await resolvePreparationTarget({mode:'preparation',preparationId:id,documentId:doc.id,revision:doc.revision,selection:{blockIds:['paragraph-first'],text:'原文第一段'}},native.call);
  const task = await preparationAssistantTool(target.sessionId!,{action:'begin'},'只改第一段') as {id:string};
  await resolvePreparationTarget({mode:'preparation',preparationId:id,documentId:doc.id},native.call);
  await assert.rejects(preparationAssistantTool(target.sessionId!,{action:'propose',taskId:task.id,baseRevision:doc.revision,operationId:op(),summary:'越界修改',content:JSON.stringify(document('修改第一段','还改第二段'))},'只改第一段'),/选区以外/);
  assert.equal(prep.listProposals(id).length,0);
  const result = await preparationAssistantTool(target.sessionId!,{action:'propose',taskId:task.id,baseRevision:doc.revision,operationId:op(),summary:'修改第一段',content:JSON.stringify(document('修改第一段'))},'只改第一段') as {proposalId:string};
  assert.ok(result.proposalId);
  assert.equal(prep.getTask(id,task.id).status,'completed');
  assert.equal(prep.getDocument(id,doc.id).revision,doc.revision);
  prep.applyProposal(id,result.proposalId,{operationId:op()});
  assert.equal(prep.getDocument(id,doc.id).content.content[1].content![0].text,'原文第二段');
}));

test('nested table selection uses the deepest block and prevents edits to a neighboring cell', async () => runWithWorkspace(context,async () => {
  const {id,doc} = fixture(), native = nativeFixture();
  const table = (neighbor='另一单元格'): RichDocument => ({type:'doc',content:[{type:'table',attrs:{id:'table-block'},content:[{type:'tableRow',attrs:{id:'table-row'},content:[{type:'tableCell',attrs:{id:'cell-first'},content:[paragraph('cell-paragraph','选中内容')]},{type:'tableCell',attrs:{id:'cell-second'},content:[paragraph('neighbor-paragraph',neighbor)]}]}]}]});
  const saved = prep.saveDocument(id,doc.id,{expectedRevision:doc.revision,operationId:op(),content:table()});
  const target = await resolvePreparationTarget({mode:'preparation',preparationId:id,documentId:doc.id,revision:saved.revision,selection:{blockIds:['table-block','table-row','cell-first','cell-paragraph'],text:'选中内容'}},native.call);
  const task = await preparationAssistantTool(target.sessionId!,{action:'begin'},'修改选中内容') as {id:string};
  await assert.rejects(preparationAssistantTool(target.sessionId!,{action:'propose',taskId:task.id,baseRevision:saved.revision,operationId:op(),summary:'不应修改邻格',content:JSON.stringify(table('错误修改'))},'修改选中内容'),/选区以外/);
}));

test('requirements changes reject stale candidates; cancellation and malformed candidates preserve the document', async () => runWithWorkspace(context,async () => {
  const {id,doc} = fixture(), native = nativeFixture();
  const target = await resolvePreparationTarget({mode:'preparation',preparationId:id,documentId:doc.id},native.call);
  const task = await preparationAssistantTool(target.sessionId!,{action:'begin'},'修改教案') as {id:string};
  const propose = {action:'propose',taskId:task.id,baseRevision:doc.revision,operationId:op(),summary:'新稿',content:'{'};
  await assert.rejects(preparationAssistantTool(target.sessionId!,propose,'修改教案'),/完整的文档格式/);
  prep.updatePreparation(id,{requirements:'课时缩短',operationId:op()});
  await assert.rejects(preparationAssistantTool(target.sessionId!,{...propose,content:JSON.stringify(document('新稿'))},'修改教案'),/备课要求或资料已变化/);
  stopSessionTasks(target.sessionId!,'cancelled','教师停止任务，原稿保留。');
  assert.equal(prep.getTask(id,task.id).status,'cancelled');
  await assert.rejects(preparationAssistantTool(target.sessionId!,{action:'progress',taskId:task.id,stage:'继续'},'修改教案'),/任务已停止/);
  assert.equal(prep.getDocument(id,doc.id).revision,doc.revision);
}));

test('assistant can read a historical revision without restoring the current document', async () => runWithWorkspace(context,async () => {
  const {id,doc} = fixture();
  prep.saveDocument(id,doc.id,{expectedRevision:doc.revision,operationId:op(),content:document('后来修改')});
  const historical = await readPreparation({ref:{type:'lessonPlan',id:doc.id,parentId:id},section:'content',filters:{revision:doc.revision},offset:0,limit:20,textOffset:0});
  assert.equal(historical!.data.metadata.revision,doc.revision);
  assert.equal(historical!.data.items[0].content[0].text,'原文第一段');
  assert.equal(prep.getDocument(id,doc.id).revision,doc.revision+1);
}));


test('late release from an earlier turn cannot stop the next turn or modify its task', async () => runWithWorkspace(context,async () => {
  const {id,doc} = fixture(), native = nativeFixture();
  const target = await resolvePreparationTarget({mode:'preparation',preparationId:id,documentId:doc.id},native.call);
  const firstLease = target.sessionId + ':turn-first', nextLease = target.sessionId + ':turn-next';
  const first = await preparationAssistantTool(target.sessionId!,{action:'begin'},'第一轮',undefined,firstLease) as {id:string};
  stopSessionTasks(target.sessionId!,'interrupted',undefined,firstLease);
  const next = await preparationAssistantTool(target.sessionId!,{action:'begin'},'下一轮',undefined,nextLease) as {id:string};
  stopSessionTasks(target.sessionId!,'interrupted',undefined,firstLease);
  assert.equal(prep.getTask(id,first.id).status,'interrupted');
  assert.equal(prep.getTask(id,next.id).status,'running');
  await assert.rejects(preparationAssistantTool(target.sessionId!,{action:'progress',taskId:next.id,stage:'错误轮次'},'第一轮',undefined,firstLease),/此前的执行轮次/);
  await preparationAssistantTool(target.sessionId!,{action:'finish',taskId:next.id,status:'completed',message:'检查完成'},'下一轮',undefined,nextLease);
  assert.equal(prep.getTask(id,next.id).status,'completed');
}));


test('guardrail: real missing fields are actionable; begin/status/propose retries verify persisted state', async()=>runWithWorkspace(context,async()=>{
 const {id,doc}=fixture(),native=nativeFixture();
 const target=await resolvePreparationTarget({mode:'preparation',preparationId:id,documentId:doc.id},native.call);
 const lease=target.sessionId+':guardrail';
 const call=(input:any)=>preparationAssistantTool(target.sessionId!,input,'修改第一段',undefined,lease) as Promise<any>;
 const first=await call({action:'begin'}), retry=await call({action:'begin'});
 assert.equal(first.taskId,retry.taskId);assert.equal(first.baseRevision,doc.revision);
 assert.equal(prep.listTasks(id).length,1);assert.equal(first.verification.verified,true);
 const input={action:'propose',taskId:first.taskId,baseRevision:doc.revision,operationId:op(),content:JSON.stringify(document('改后正文'))};
 await assert.rejects(call(input),(error:any)=>error.code==='INVALID_PREPARATION_INPUT'&&error.issues.some((i:any)=>i.field==='propose.summary'));
 await assert.rejects(call({action:'finish',taskId:first.taskId,status:'completed',summary:'完成'}),(error:any)=>error.issues.some((i:any)=>i.field==='finish.message'));
 assert.equal(prep.listProposals(id).length,0);
 const submitted={...input,summary:'修改第一段'}, result=await call(submitted), repeated=await call(submitted);
 assert.equal(result.proposalId,repeated.proposalId);assert.equal(prep.listProposals(id).length,1);
 assert.equal((await call({action:'status',taskId:first.taskId})).verification.proposal.status,'pending');
 await assert.rejects(call({...submitted,summary:'不同内容'}),/操作编号/);
 assert.equal(prep.getDocument(id,doc.id).revision,doc.revision);
 prep.applyProposal(id,result.proposalId,{operationId:op()});
 const status=await call({action:'status',taskId:first.taskId});
 assert.equal(status.verification.proposal.status,'applied');assert.equal(status.verification.proposal.appliedRevision,doc.revision+1);
 await assert.rejects(preparationAssistantTool(target.sessionId!,{action:'status',taskId:first.taskId},'',undefined,lease+'other'),/不属于/);
}));

test('missing preparation parent is a parameter error, not a nonexistent document',async()=>runWithWorkspace(context,async()=>{
 const {doc}=fixture();
 await assert.rejects(readPreparation({ref:{type:'lessonPlan',id:doc.id},section:'content',filters:{},offset:0,limit:20,textOffset:0}),(error:any)=>error.code==='INVALID_QUERY'&&error.message.includes('ref.parentId'));
}));


test('verify mismatch rolls back candidate and completion together',async()=>runWithWorkspace(context,async()=>{
 const {id,doc}=fixture(),native=nativeFixture();
 const target=await resolvePreparationTarget({mode:'preparation',preparationId:id,documentId:doc.id},native.call);
 const task:any=await preparationAssistantTool(target.sessionId!,{action:'begin'},'修改');
 const original=preparationRepository.list;
 preparationRepository.list=function(table:any,parent?:string):any {const rows=original.call(this,table,parent);return table==='preparation_proposals'?rows.map((row:any)=>({...row,summary:'模拟存储不一致'})):rows;};
 try{await assert.rejects(preparationAssistantTool(target.sessionId!,{action:'propose',taskId:task.id,baseRevision:doc.revision,content:JSON.stringify(document('新稿')),summary:'预期摘要',operationId:op()},'修改'),/核验失败/);}
 finally{preparationRepository.list=original;}
 assert.equal(prep.listProposals(id).length,0);assert.equal(prep.getTask(id,task.id).status,'running');
 assert.equal(prep.getDocument(id,doc.id).revision,doc.revision);
}));


test('candidate delivery blocks generated disclaimers, permits teaching presets and leaves teacher paragraphs intact',async()=>runWithWorkspace(context,async()=>{
 const {id,doc}=fixture();
 const target=await resolvePreparationTarget({mode:'preparation',preparationId:id,documentId:doc.id,revision:doc.revision},nativeFixture().call);
 const task:any=await preparationAssistantTool(target.sessionId!,{action:'begin',stage:'编写教案'},'生成陋室铭教案');
 const proposed={action:'propose',taskId:task.taskId,baseRevision:doc.revision,operationId:op(),summary:'生成教案'};
 await assert.rejects(preparationAssistantTool(target.sessionId!,{...proposed,content:JSON.stringify(document('本班具体学习情况尚未提供，以下作为一般教学预设：学生可借助注释阅读。'))},'生成教案'),(error:any)=>error.code==='GENERATION_NOTE_IN_DOCUMENT'&&/尚未保存/.test(error.message));
 assert.equal(prep.listProposals(id).length,0);
 assert.equal(prep.getDocument(id,doc.id).revision,doc.revision);
 assert.equal(prep.getTask(id,task.taskId).status,'running');
 const result:any=await preparationAssistantTool(target.sessionId!,{...proposed,content:JSON.stringify(document('课前用朗读与释义任务诊断文言基础，观察能否用原句说明“德馨”。','预设回答：环境清幽。教师追问：这些景物怎样说明陋室不陋？'))},'生成教案');
 assert.equal(result.verification.verified,true);
 assert.equal(result.verification.proposal.status,'pending');
 const {assertCandidateDelivery}=await import('../preparation/candidateDelivery');
 const old=document('本班具体学习情况尚未提供，以下作为一般教学预设。','教师已经写下的段落');
 assert.doesNotThrow(()=>assertCandidateDelivery(old,document('本班具体学习情况尚未提供，以下作为一般教学预设。','仅修改这一段的课堂活动')));
 assert.throws(()=>assertCandidateDelivery(old,{type:'doc',content:[paragraph('new-note','由于教师未提供学情，暂按通用情况生成。')]}),/生成说明/);
}));

test('selected source pagination returns an executable continuation with no overlap or gaps',async()=>runWithWorkspace(context,async()=>{
 const {id}=fixture();await mkdir(context.uploadDirectory,{recursive:true});
 const bytes=Buffer.from(Array.from({length:23},(_,i)=>`第${i+1}页合成材料`).join('\n'));
 const filePath=path.join(context.uploadDirectory,'continuation.txt');await writeFile(filePath,bytes);
 const item=materialPoolRepository.createItem({id:op(),originalName:'连续材料.txt',detectedMime:'text/plain',sizeBytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),diskPath:filePath,source:'test'});
 const source=await prep.addSource(id,{kind:'pool',id:item.id,role:'reference',operationId:op()});
 const args={ref:{type:'preparationSource' as const,id:source.id,parentId:id},section:'original',filters:{},offset:0,limit:50,textOffset:0};
 const first:any=await readPreparation(args);
 assert.equal(first.data.paging.effectiveLimit,10);
 assert.equal(first.data.coverage.to,10);assert.equal(first.data.nextRead.offset,10);assert.equal(first.data.nextRead.limit,10);
 const second:any=await readPreparation({...args,...first.data.nextRead});
 const third:any=await readPreparation({...args,...second.data.nextRead});
 assert.equal(third.data.nextRead,null);assert.equal(third.data.coverage.to,23);
 assert.deepEqual([first,second,third].flatMap(r=>r.data.items.map((p:any)=>p.index)),Array.from({length:23},(_,i)=>i+1));
 const other={...context,userId:'other-teacher'};
 await runWithWorkspace(other,async()=>assert.rejects(readPreparation({...args,...first.data.nextRead}),/当前账号可访问/));
}));

test('selection reference reports original revision and expires after document changes, then can be removed',async()=>runWithWorkspace(context,async()=>{
 const {id,doc}=fixture(),native=nativeFixture();
 const selection={blockIds:['paragraph-first'],text:'原文',location:{from:1,to:3,blocks:[{id:'paragraph-first',from:0,to:2}]}};
 const target=await resolvePreparationTarget({mode:'preparation',preparationId:id,documentId:doc.id,revision:doc.revision,selection},native.call);
 let outcome=preparationSavedOutcome(target.sessionId!);
 assert.ok(outcome.bound&&outcome.selection&&!outcome.selection.stale);
 if(outcome.bound)assert.deepEqual(outcome.selection?.location,selection.location);
 prep.saveDocument(id,doc.id,{expectedRevision:doc.revision,operationId:op(),content:document('新版原文')});
 outcome=preparationSavedOutcome(target.sessionId!);
 assert.ok(outcome.bound&&outcome.selection?.stale);
 await resolvePreparationTarget({mode:'preparation',sessionId:target.sessionId,preparationId:id,documentId:doc.id},native.call);
 outcome=preparationSavedOutcome(target.sessionId!);
 assert.ok(outcome.bound&&!outcome.selection);
}));
