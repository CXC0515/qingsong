import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.APP_DATA_ROOT=mkdtempSync(path.join(os.tmpdir(),'qs-mem0-sdk-'));
const {createWorkspaceContext,runWithWorkspace}=await import('../../context/workspaceContext');
const {getMemoryClient,setMemoryClientFactoryForTests}=await import('./mem0Client');
const context=createWorkspaceContext('sdk-user-fixture','sdk-work-fixture','teacher');
test('real Mem0 3.3.1 + Qdrant REST SDK: scoped insert, semantic query, update and delete',async()=>{
 const collections=new Map<string,Map<string,any>>(),requests:string[]=[];
 const server=createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;const body=raw?JSON.parse(raw):{};
  const url=new URL(req.url!,'http://fixture'),parts=url.pathname.split('/').filter(Boolean),name=parts[1];
  requests.push(req.method+' '+url.pathname);
  const send=(result:any,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify({result,status:'ok',time:0}));};
  if(url.pathname==='/v1/embeddings'){
   const texts=Array.isArray(body.input)?body.input:[body.input];
   res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({data:texts.map((_:string,index:number)=>({index,embedding:[1,0,0]}))}));return;
  }
  if(parts[0]!=='collections'){send({},404);return;}
  if(parts.length===2&&req.method==='PUT'){if(collections.has(name)){send({},409);return;}collections.set(name,new Map());send(true);return;}
  if(parts.length===2&&req.method==='GET'){send({config:{params:{vectors:{size:3,distance:'Cosine'}}}});return;}
  const data=collections.get(name)??new Map();
  if(parts[2]==='index'){send({operation_id:1,status:'completed'});return;}
  if(parts[2]==='points'){
   if(parts[3]==='search'){send([...data.values()].map(hit=>({...hit,score:.9})));return;}
   if(parts[3]==='query'){send({points:[]});return;}
   if(parts[3]==='delete'){for(const id of body.points??[])data.delete(id);send({operation_id:1,status:'completed'});return;}
   if(parts[3]==='scroll'){send({points:[...data.values()],next_page_offset:null});return;}
   if(req.method==='PUT'){for(const point of body.points??[])data.set(point.id,point);send({operation_id:1,status:'completed'});return;}
   if(req.method==='POST'){send((body.ids??[]).flatMap((id:string)=>data.has(id)?[data.get(id)]:[]));return;}
  }
  send({},404);
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+(server.address() as any).port;
 for(const [key,value] of Object.entries({ENABLED:'true',LLM_MODEL:'fixture',LLM_BASE_URL:url+'/v1',LLM_API_KEY:'fixture',EMBEDDING_MODEL:'fixture',EMBEDDING_BASE_URL:url+'/v1',EMBEDDING_API_KEY:'fixture',EMBEDDING_DIMENSIONS:'3',QDRANT_URL:url}))process.env['QS_MEMORY_'+key]=value;
 try{await runWithWorkspace(context,async()=>{
  const client=(await getMemoryClient())!;
  const added=await client.add('任教初二语文',{entryId:'local-fixture'});assert.equal(added.length,1);
  assert.equal((await client.get(added[0].id))?.memory,'任教初二语文');
  const found=await client.search('我的授课背景');assert.equal(found[0].id,added[0].id);assert.equal(found[0].score_details?.semanticScore,.9);
  await client.update(added[0].id,'任教初三语文');assert.equal((await client.get(added[0].id))?.memory,'任教初三语文');
  await client.delete(added[0].id);assert.equal(await client.get(added[0].id),null);
  assert.ok(requests.some(r=>r.includes('/points/search')));assert.equal(process.env.MEM0_TELEMETRY,'false');
 });}finally{setMemoryClientFactoryForTests();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));rmSync(process.env.APP_DATA_ROOT!,{recursive:true,force:true});}
});
