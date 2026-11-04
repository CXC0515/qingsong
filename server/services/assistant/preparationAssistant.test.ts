import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { runWithWorkspace, type WorkspaceContext } from '../../context/workspaceContext';
import { closePreparationDatabase } from '../../database/preparationDatabase';
import * as prep from '../preparation/preparationService';
import { preparationAssistantTool, resolvePreparationTarget, stopSessionTasks } from './preparationAssistant';
import { readPreparation } from './capabilities/preparation';
import type { RichDocument } from '../../../src/domain/document';

const root = await mkdtemp(path.join(tmpdir(), 'qs-preparation-assistant-'));
const context: WorkspaceContext = { userId: 'teacher-helper', workspaceId: 'workspace-helper', role: 'teacher', root, dataDirectory: path.join(root, 'data'), uploadDirectory: path.join(root, 'uploads') };
after(async () => { closePreparationDatabase(); await rm(root, {recursive:true,force:true}); });
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

test('concurrent opens reuse a workspace/session, null projections recreate a deleted session, other owners cannot open it', async () => runWithWorkspace(context,async () => {
  const {id,doc} = fixture(), native = nativeFixture();
  const request = {mode:'preparation',preparationId:id,documentId:doc.id};
  const targets = await Promise.all([resolvePreparationTarget(request,native.call),resolvePreparationTarget(request,native.call)]);
  assert.equal(targets[0].sessionId,targets[1].sessionId);
  assert.equal(native.calls.filter(call => call === 'session/create').length,1);
  native.sessions.clear();
  const recreated = await resolvePreparationTarget(request,native.call);
  assert.notEqual(recreated.sessionId,targets[0].sessionId);
  await runWithWorkspace({...context,userId:'another-teacher'},async () => {
    const before = native.calls.length;
    await assert.rejects(resolvePreparationTarget(request,native.call),/当前账号可访问/);
    assert.equal(native.calls.length,before);
  });
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
  const next = await preparationAssistantTool(target.sessionId!,{action:'begin'},'下一轮',undefined,nextLease) as {id:string};
  stopSessionTasks(target.sessionId!,'interrupted',undefined,firstLease);
  assert.equal(prep.getTask(id,first.id).status,'interrupted');
  assert.equal(prep.getTask(id,next.id).status,'running');
  await assert.rejects(preparationAssistantTool(target.sessionId!,{action:'progress',taskId:next.id,stage:'错误轮次'},'第一轮',undefined,firstLease),/此前的执行轮次/);
  await preparationAssistantTool(target.sessionId!,{action:'finish',taskId:next.id,status:'completed',message:'检查完成'},'下一轮',undefined,nextLease);
  assert.equal(prep.getTask(id,next.id).status,'completed');
}));
