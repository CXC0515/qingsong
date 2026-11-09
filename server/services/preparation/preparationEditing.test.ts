import test from 'node:test';
import assert from 'node:assert/strict';
import {runWithWorkspace,type WorkspaceContext} from '../../context/workspaceContext';
import {subscribePreparationEditing,prepareDocumentEditing,confirmDocumentEditing,releaseDocumentEditing,preparationEditingChanged} from './preparationEditing';
const context:WorkspaceContext={userId:'editing-teacher',workspaceId:'editing-workspace',role:'teacher',root:'/tmp',dataDirectory:'/tmp',uploadDirectory:'/tmp'};
test('preparation waits for every visible editor and ignores other accounts',()=>runWithWorkspace(context,async()=>{
 let request='',done=false;const events:string[]=[];
 const off1=subscribePreparationEditing('lesson','one',event=>{events.push(event.type);if(event.requestId)request=event.requestId;});
 const off2=subscribePreparationEditing('lesson','two',()=>{});
 try{
  const promise=prepareDocumentEditing('lesson','doc').then(()=>{done=true;});
  runWithWorkspace({...context,userId:'someone-else'},()=>confirmDocumentEditing('lesson','doc',request,'one',true));
  confirmDocumentEditing('lesson','doc',request,'two',true);await Promise.resolve();assert.equal(done,false);
  confirmDocumentEditing('lesson','doc',request,'one',true);await promise;assert.equal(done,true);
  releaseDocumentEditing('lesson','doc');assert.deepEqual(events,['prepare','released']);
 }finally{off1();off2();}
}));
test('failed draft saves and aborted handshakes prevent starting an AI write',()=>runWithWorkspace(context,async()=>{
 let request='';const off=subscribePreparationEditing('failed','editor',event=>{if(event.requestId)request=event.requestId;});
 try{
  const failed=prepareDocumentEditing('failed','doc');confirmDocumentEditing('failed','doc',request,'editor',false);await assert.rejects(failed,/草稿尚未保存/);
  const controller=new AbortController();const cancelled=prepareDocumentEditing('failed','doc',controller.signal);controller.abort();await assert.rejects(cancelled,/取消/);
 }finally{off();}
 await prepareDocumentEditing('no-visible-editor','doc');
}));
test('a closed transport cannot roll back a business state notification',()=>runWithWorkspace(context,()=>{
 const off=subscribePreparationEditing('closed','editor',()=>{throw Error('closed');});
 try{assert.doesNotThrow(()=>preparationEditingChanged('closed'));assert.doesNotThrow(()=>releaseDocumentEditing('closed','doc'));}finally{off();}
}));
