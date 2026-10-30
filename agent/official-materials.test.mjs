import test from 'node:test';
import assert from 'node:assert/strict';
import {materialContext,materialTool} from './official-materials.mjs';
import {validOfficialContent} from './official-policy.mjs';
const id='12345678-1234-1234-1234-123456789abc';
const ref={attachmentId:'sha256:'+ 'a'.repeat(64),name:'课堂.txt',bytes:12};
const ctx={attachments:{fileHostPath:r=>'/private/'+r.attachmentId,imageHostPath:r=>'/images/'+r.attachmentId}};

test('only real human source may register attachments or material-pool references',()=>{
 const result=materialContext(ctx,[
  {source:{kind:'tool'},content:[{type:'file',attachment:ref},{type:'text',text:`[[青松材料:${id}]]`}]},
  {source:{kind:'user'},content:[{type:'file',attachment:ref},{type:'file',attachment:ref}]},
 ]);
 assert.equal(result.attachments.length,1);assert.deepEqual(result.poolIds,[]);
 const human=materialContext(ctx,[{source:{kind:'user'},content:[{type:'text',text:`阅读 [[青松材料:${id}]] 和 [[青松材料:${id}]]`},{type:'image',attachment:{...ref,mediaType:'image/png'}}]}]);
 assert.deepEqual(human.poolIds,[id]);assert.equal(human.attachments[0].kind,'image');
 assert.equal(human.attachments[0].filePath,'/images/'+ref.attachmentId);
});

test('native content accepts genuine wire types but rejects paths, oversized or empty inputs',()=>{
 assert.equal(validOfficialContent([{type:'text',text:' '}]),false);
 assert.equal(validOfficialContent([{type:'text',text:'阅读'},{type:'file',receiptId:'one'}]),true);
 assert.equal(validOfficialContent([{type:'file',receiptId:'one',filePath:'/etc/config'}]),false);
 assert.equal(validOfficialContent([{type:'image',mediaType:'image/png',data:'AQID'}]),true);
 assert.equal(validOfficialContent([{type:'image',mediaType:'image/png',data:'file:///private'}]),false);
 assert.equal(validOfficialContent(Array.from({length:6},()=>({type:'image',mediaType:'image/png',data:'AQID'}))),false);
 assert.equal(validOfficialContent([{type:'text',text:'x'.repeat(8001)}]),false);
 assert.equal(validOfficialContent([{type:'image',mediaType:'image/png',data:'A'.repeat(13981020)}]),false);
});

test('material tool inherits turn quota and cannot run without the owning turn',async()=>{
 const calls=[];const turns=new Map([['a',{queries:11}]]);
 const tool=materialTool(ctx,async body=>{calls.push(body);return {references:[]};},turns);
 assert.deepEqual(JSON.parse(await tool.execute({action:'list'},{agent:{id:'a'},signal:new AbortController().signal})).result,{references:[]});
 assert.equal(calls[0].sessionId,'a');assert.equal(calls[0].kind,'material');
 await assert.rejects(tool.execute({action:'list'},{agent:{id:'a'},signal:new AbortController().signal}),/额度/);
 await assert.rejects(tool.execute({action:'list'},{agent:{id:'b'},signal:new AbortController().signal}),/额度/);
});

test('render refuses a text-only route before accessing material',async()=>{
 let called=false;
 const fake={...ctx,llm:{resolveModelInfo:async()=>({inputModalities:['text']})}};
 const tool=materialTool(fake,async()=>{called=true;return{};},new Map([['a',{queries:0}]]));
 await assert.rejects(tool.execute({action:'render'},{agent:{id:'a',options:{provider:'fixture',model:'text'},session:{requestHeader:()=>undefined}},signal:new AbortController().signal}),/不支持图片/);
 assert.equal(called,false);
});

test('rendered images become durable native image blocks instead of base64 prompt text',async()=>{
 let saved;
 const imageRef={attachmentId:'sha256:'+ 'b'.repeat(64),mediaType:'image/png',bytes:3,width:1,height:1};
 const fake={llm:{resolveModelInfo:async()=>({inputModalities:['text','image']})},attachments:{saveImage:async data=>{saved=data;return imageRef;}}};
 const tool=materialTool(fake,async()=>({sources:['第1页'],images:[{data:'AQID',mediaType:'image/png',name:'page-1.png'}]}),new Map([['a',{queries:0}]]));
 const value=await tool.execute({action:'render'},{agent:{id:'a',options:{provider:'fixture',model:'vision'},session:{requestHeader:()=>undefined}},signal:new AbortController().signal});
 assert.deepEqual([...saved.data],[1,2,3]);assert.equal(value.includes('AQID'),false);
 const blocks=tool.output.render({},value);assert.equal(blocks[0].type,'text');assert.deepEqual(blocks[1],{type:'image',attachment:imageRef});
});

test('long resumed histories register bounded increments and only commit successful batches',async()=>{
 const {synchronizeMaterials}=await import('./official-materials.mjs');
 const messages=[{source:{kind:'user'},content:Array.from({length:25},(_,i)=>({type:'file',attachment:{...ref,attachmentId:'sha256:'+i.toString(16).padStart(64,'0')}}))}];
 const registered=new Set();let requests=[];
 const bridge=async request=>{requests.push(request);return {references:Array.from({length:25},(_,i)=>({id:String(i),name:'资料',mimeType:'text/plain'}))};};
 const one=await synchronizeMaterials(ctx,'s',messages,bridge,registered,new AbortController().signal);
 assert.equal(requests[0].attachments.length,20);assert.equal(one.references.length,20);assert.equal(one.contextCoverage.complete,false);
 await assert.rejects(synchronizeMaterials(ctx,'s',messages,async()=>{throw Error('offline');},registered,new AbortController().signal),/offline/);
 assert.equal(registered.size,20);
 const two=await synchronizeMaterials(ctx,'s',messages,bridge,registered,new AbortController().signal);
 assert.equal(requests[1].attachments.length,5);assert.equal(two.contextCoverage.complete,true);
});

test('render reservations release after image persistence, including failure',async()=>{
 const calls=[];const fake={llm:{resolveModelInfo:async()=>({inputModalities:['image']})},attachments:{saveImage:async()=>{calls.push('save');throw Error('disk');}}};
 const bridge=async body=>{if(body.kind==='material-images-saved'){calls.push('release:'+body.reservationId);return{};}return {reservationId:'reservation',images:[{data:'AQID',mediaType:'image/png'}]};};
 const tool=materialTool(fake,bridge,new Map([['a',{queries:0}]]));
 await assert.rejects(tool.execute({action:'render'},{agent:{id:'a',options:{provider:'fixture',model:'vision'},session:{requestHeader:()=>undefined}},signal:new AbortController().signal}),/disk/);
 assert.deepEqual(calls,['save','release:reservation']);
});

test('native picker reply must match parent, connection and session, then inserts revision-guarded file chips',async()=>{
 const vm=await import('node:vm');const {readFile}=await import('node:fs/promises');const {createRequire}=await import('node:module');
 const require=createRequire(new URL('../package.json',import.meta.url));const React=require('react');
 const effects=[],slots=[],posted=[],listeners=new Map(),inserted=[],timers=new Map();let plugin,stateCount=0,revision=3,persisted=0,timerId=0;
 const fakeReact={...React,useEffect:callback=>effects.push(callback),useRef:value=>({current:value}),useState:value=>[stateCount++===0?true:value,()=>{}]};
 const parent={postMessage:message=>posted.push(message)};
 const scope={};
 const context={slots:{inject:(_name,register)=>register(),register:(config,render)=>slots.push({config,render})},effect:()=>{},sessions:{scope:()=>scope},conversation:{input:{for:()=>({insertReference:(reference,span)=>{if(span.draftRev!==revision)return false;inserted.push(reference);revision++;return true;}})}}};
 const source=await readFile(new URL('./official-ui/client.js',import.meta.url),'utf8');
 vm.runInNewContext(source,{window:{name:'qingsong-assistant:connection-one',__ModuleLoader__:{load:module=>{plugin=module.factory(()=>fakeReact);}},addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)},parent,location:{origin:'https://fixture.test'},document:{addEventListener:()=>{},removeEventListener:()=>{}},crypto,performance,setTimeout:(callback,ms)=>{timers.set(++timerId,{callback,ms});return timerId;},clearTimeout:id=>timers.delete(id),URLSearchParams});
 plugin.apply(context);
 const slot=slots.find(row=>row.config.id==='qingsong-materials');assert.ok(slot);
 const props={sessionId:'session-one',useInput:select=>select({phase:'plain'}),inputActions:{captureInsertion:()=>({start:0,end:0,draftRev:revision}),persistDraft:()=>persisted++},...slot.config.inject('session-one')};
 const element=slot.render(props);const tree=element.type(element.props);const disposers=effects.map(run=>run());
 const buttons=[];const visit=node=>{if(!node||typeof node!=='object')return;if(node.type==='button')buttons.push(node);for(const child of React.Children.toArray(node.props?.children))visit(child);};visit(tree);
 const choose=buttons.find(node=>React.Children.toArray(node.props.children).includes('从材料池选择'));assert.ok(choose);choose.props.onClick();
 const request=posted.at(-1);assert.equal(request.connectionId,'connection-one');assert.equal(request.sessionId,'session-one');
 const data={type:'qingsong:materials-picked',requestId:request.requestId,sessionId:'session-one',connectionId:'connection-one',references:[{id,name:'课件.pptx'}]};
 const receive=listeners.get('message');receive({origin:'https://evil.test',source:parent,data});receive({origin:'https://fixture.test',source:{},data});receive({origin:'https://fixture.test',source:parent,data:{...data,connectionId:'old'}});
 assert.equal(inserted.length,0);
 assert.equal(timers.size,1);assert.equal([...timers.values()][0].ms,10000);
 receive({origin:'https://fixture.test',source:parent,data:{...data,type:'qingsong:materials-opened'}});
 assert.equal(timers.size,0,'an open picker must not time out while the teacher chooses');assert.equal(inserted.length,0);
 receive({origin:'https://fixture.test',source:parent,data});assert.equal(inserted.length,1);assert.equal(inserted[0].appearance,'file');assert.equal(inserted[0].source,'qingsong-pool');assert.equal(inserted[0].clipboardText,`[[青松材料:${id}]]`);assert.equal(persisted,1);
 for(const dispose of disposers)dispose?.();
});

test('new image input is gated, while a text question after historical images remains available',async()=>{
 const {apply}=await import('./official-teaching.mjs');
 const previousFetch=globalThis.fetch,handlers=new Map(),disposers=[];let modelChecks=0;
 globalThis.fetch=async(_url,options)=>{
  const body=JSON.parse(options.body);
  const value=body.kind==='personal-context'?{guidance:'fixture'}:body.kind==='materials-context'?{references:[]}:{};
  return new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});
 };
 const fake={...ctx,systemPrompt:{context:()=>()=>{},section:()=>()=>{}},tools:{guard:()=>()=>{},register:()=>()=>{}},llm:{resolveModelInfo:async()=>{modelChecks++;return{inputModalities:['text']};}},on:(name,handler)=>handlers.set(name,handler),effect:run=>{const cleanup=run();if(typeof cleanup==='function')disposers.push(cleanup);}};
 try {
  apply(fake);
  const agent={id:'session-image',options:{provider:'fixture',model:'text'},session:{requestHeader:()=>undefined}};
  const image={id:'old-image',source:{kind:'user'},content:[{type:'image',attachment:{...ref,mediaType:'image/png'}}]};
  const text={id:'new-text',source:{kind:'user'},content:[{type:'text',text:'只查询课表'}]};
  const event={agent,turn:1,messages:[image,text],signal:new AbortController().signal};
  assert.equal(await handlers.get('agent/pre-step')(event,async()=> 'next'),'next');assert.equal(modelChecks,0);
  await assert.rejects(handlers.get('agent/pre-step')({...event,messages:[image,text,{...image,id:'new-image'}]},async()=> 'next'),/不支持图片/);
  assert.equal(modelChecks,1);
  handlers.get('session/event')({id:agent.id},{type:'turn/end'});
 }finally{for(const dispose of disposers)dispose();globalThis.fetch=previousFetch;}
});
