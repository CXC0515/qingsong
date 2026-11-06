import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {runWithWorkspace,type WorkspaceContext} from '../../context/workspaceContext';
import {closePreparationDatabase} from '../../database/preparationDatabase';
import * as prep from '../preparation/preparationService';
import {previewPreparationReference,createPreparationReference,registerPreparationReferences,resolveTaskReference,sessionPreparationReferences,listPreparationReferenceCandidates,preparationReferenceStatus,updatePreparationReference} from './preparationReferences';
import {resolvePreparationTarget,preparationAssistantTool,stopSessionTasks} from './preparationAssistant';
const root=await mkdtemp(path.join(tmpdir(),'qs-lesson-references-'));
const context:WorkspaceContext={userId:'reference-teacher',workspaceId:'reference-workspace',role:'teacher',root,dataDirectory:path.join(root,'data'),uploadDirectory:path.join(root,'uploads')};
after(async()=>{closePreparationDatabase();await rm(root,{recursive:true,force:true});});
const make=()=>prep.createPreparation({title:'引用教案',operationId:randomUUID()});
test('picker finds owned versions; updating a source preserves history and refuses stale selections',()=>runWithWorkspace(context,()=>{
 const lesson=make(),id=lesson.preparation.id,doc=lesson.documents[0];
 assert.ok(listPreparationReferenceCandidates('引用教案').some(item=>item.preparationId===id));
 const whole=createPreparationReference({preparationId:id});
 const selected=createPreparationReference({preparationId:id,selection:{blockIds:['p'],text:'旧文'}});
 prep.saveDocument(id,doc.id,{expectedRevision:1,operationId:randomUUID(),content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'新版'}]}]}});
 assert.equal(preparationReferenceStatus(whole.id).stale,true);
 const updated=updatePreparationReference(whole.id);
 assert.equal(updated.revision,2);assert.notEqual(updated.id,whole.id);
 assert.equal(preparationReferenceStatus(whole.id).revision,1);
 assert.throws(()=>updatePreparationReference(selected.id),/重新选择/);
 runWithWorkspace({...context,userId:'another-picker-user'},()=>{
  assert.equal(listPreparationReferenceCandidates().length,0);
  assert.throws(()=>updatePreparationReference(whole.id),/引用不可用/);
 });
}));
test('reopening the same source reuses its reference; a selection remains a distinct source',()=>runWithWorkspace(context,()=>{
 const lesson=make(),input={preparationId:lesson.preparation.id};
 const first=createPreparationReference(input),second=createPreparationReference(input);
 assert.equal(first.id,second.id);
 const selected=createPreparationReference({...input,selection:{blockIds:['paragraph-one'],text:'选中段落'}});
 assert.notEqual(first.id,selected.id);
 registerPreparationReferences('deduplicated-chat',[first.id,second.id],[second.id]);
 assert.equal(sessionPreparationReferences('deduplicated-chat').length,1);
 assert.equal(resolveTaskReference('deduplicated-chat').id,first.id);
}));
test('opening a preparation creates a reference but no native session or hard binding',()=>runWithWorkspace(context,async()=>{
 const lesson=make(),calls:string[]=[];
 const target=await resolvePreparationTarget({mode:'preparation',preparationId:lesson.preparation.id},async(method)=>{calls.push(method);return {workspace:{workspaceId:'native-workspace'}};});
 assert.ok(target.reference?.id);assert.equal(target.sessionId,undefined);assert.ok(!calls.includes('session/create'));
 assert.equal(prep.listPreparationSessions(lesson.preparation.id).length,0);
 assert.deepEqual(sessionPreparationReferences('native-chat'),[]);
}));
test('one native chat can reference multiple lessons; ambiguous writes stop; targets stay with tasks',()=>runWithWorkspace(context,async()=>{
 const a=make(),b=make(),session='multi-lesson-chat';
 const ra=createPreparationReference({preparationId:a.preparation.id}),rb=createPreparationReference({preparationId:b.preparation.id});
 registerPreparationReferences(session,[ra.id,rb.id],[ra.id,rb.id]);
 assert.equal(sessionPreparationReferences(session).length,2);
 assert.throws(()=>resolveTaskReference(session),/明确/);
 await assert.rejects(preparationAssistantTool(session,{action:'begin'},'修改'),/明确/);
 const ta:any=await preparationAssistantTool(session,{action:'begin',referenceId:ra.id},'修改A',undefined,'lease-a');
 const tb:any=await preparationAssistantTool(session,{action:'begin',referenceId:rb.id},'修改B',undefined,'lease-b');
 assert.equal(prep.getTask(a.preparation.id,ta.id).documentId,a.documents[0].id);
 assert.equal(prep.getTask(b.preparation.id,tb.id).documentId,b.documents[0].id);
 await preparationAssistantTool(session,{action:'finish',taskId:ta.id,status:'needs-input',message:'请补充A要求'},'修改A',undefined,'lease-a');
 assert.equal(prep.getTask(b.preparation.id,tb.id).status,'running');
 stopSessionTasks(session,'interrupted',undefined,'lease-b');
 assert.equal(prep.getTask(a.preparation.id,ta.id).status,'needs-input');
 assert.equal(prep.getTask(b.preparation.id,tb.id).status,'interrupted');
}));
test('references require actual send, retain version, and never grant another account access',()=>runWithWorkspace(context,async()=>{
 const a=make(),reference=createPreparationReference({preparationId:a.preparation.id});
 assert.throws(()=>resolveTaskReference('unsent-chat',reference.id),/明确/);
 registerPreparationReferences('sent-chat',[reference.id],[reference.id]);
 prep.saveDocument(a.preparation.id,a.documents[0].id,{expectedRevision:1,operationId:randomUUID(),content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'新版'}]}]}});
 assert.equal(resolveTaskReference('sent-chat',reference.id).revision,1);
 await assert.rejects(preparationAssistantTool('sent-chat',{action:'begin',referenceId:reference.id},'修改旧版'),/正文已变化/);
 runWithWorkspace({...context,userId:'other-teacher'},()=>{assert.deepEqual(sessionPreparationReferences('sent-chat'),[]);assert.throws(()=>registerPreparationReferences('sent-chat',[reference.id],[reference.id]));});
}));

test('reference preview reads the original immutable version and checks workspace ownership',()=>runWithWorkspace(context,()=>{
 const a=make(),reference=createPreparationReference({preparationId:a.preparation.id});
 const before=previewPreparationReference(reference.id);
 prep.saveDocument(a.preparation.id,a.documents[0].id,{expectedRevision:1,operationId:randomUUID(),content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'修改后正文'}]}]}});
 const preview=previewPreparationReference(reference.id);assert.deepEqual(preview.content,before.content);assert.equal(preview.reference.stale,true);assert.match(preview.url,/documentId=/);
 assert.throws(()=>runWithWorkspace({...context,userId:'other-teacher'},()=>previewPreparationReference(reference.id)));
}));
