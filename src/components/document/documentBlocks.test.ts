import test from 'node:test';
import assert from 'node:assert/strict';
import {Schema} from '@tiptap/pm/model';
import {EditorState} from '@tiptap/pm/state';
import {history,undo,redo} from '@tiptap/pm/history';
import {documentBlockAt,moveDocumentBlock,moveDocumentBlockBy} from './documentBlocks';
const schema=new Schema({nodes:{doc:{content:'block+'},text:{group:'inline'},paragraph:{group:'block',content:'inline*',attrs:{id:{default:null}}},table:{group:'block',content:'row+'},row:{content:'cell+'},cell:{content:'paragraph+'},bulletList:{group:'block',content:'listItem+'},listItem:{content:'paragraph+'},columns:{group:'block',content:'column{2,3}'},column:{content:'block+'}}});
const p=(text:string)=>schema.nodes.paragraph.create({id:text},schema.text(text));
const make=(nodes:any[])=>EditorState.create({doc:schema.nodes.doc.create(null,nodes),plugins:[history()]});
test('whole blocks reorder in one undo step with stable IDs and redo',()=>{
 let state=make([p('甲'),p('乙'),p('丙')]);const original=state.doc.toJSON();
 const transaction=moveDocumentBlockBy(state,0,1);assert.ok(transaction);state=state.apply(transaction);
 assert.equal(state.doc.textContent,'乙甲丙');assert.equal(state.doc.child(1).attrs.id,'甲');
 assert.ok(undo(state,tr=>{state=state.apply(tr);}));assert.deepEqual(state.doc.toJSON(),original);
 assert.ok(redo(state,tr=>{state=state.apply(tr);}));assert.equal(state.doc.textContent,'乙甲丙');
 assert.equal(moveDocumentBlockBy(state,0,-1),null);
});
test('table cells and list items select their outer block and move intact',()=>{
 const table=schema.nodes.table.create(null,schema.nodes.row.create(null,schema.nodes.cell.create(null,p('表格'))));
 const list=schema.nodes.bulletList.create(null,schema.nodes.listItem.create(null,p('列表')));
 let state=make([table,list,p('末尾')]);assert.equal(documentBlockAt(state.doc,4)?.node.type.name,'table');
 assert.equal(documentBlockAt(state.doc,table.nodeSize+3)?.node.type.name,'bulletList');
 const tr=moveDocumentBlock(state,0,table.nodeSize,true);assert.ok(tr);state=state.apply(tr);
 assert.deepEqual(state.doc.child(1).toJSON(),table.toJSON());assert.deepEqual(state.doc.child(0).toJSON(),list.toJSON());
});
test('columns keep independent movement boundaries',()=>{
 const column=schema.nodes.column.create(null,[p('甲'),p('乙')]);
 const state=make([schema.nodes.columns.create(null,[column,schema.nodes.column.create(null,p('丙'))]),p('外部')]);
 assert.equal(documentBlockAt(state.doc,3)?.position,2);
 assert.ok(moveDocumentBlockBy(state,2,1));
 assert.equal(moveDocumentBlock(state,2,2+column.nodeSize),null);
 assert.equal(moveDocumentBlockBy(state,5,1),null);
});
