import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request,type Server} from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import {pipeOfficialEventStream} from './officialStream';
const listen=(server:Server)=>new Promise<number>(resolve=>server.listen(0,'127.0.0.1',()=>resolve((server.address() as {port:number}).port)));
const stop=(server:Server)=>new Promise<void>(resolve=>{server.closeAllConnections();server.close(()=>resolve());});
test('SSE sends first frame immediately, survives upstream idle timeout, revokes auth and releases heartbeat',async()=>{
 let revoked=false,checks=0,timedOut=false,upstreamClosed=false;
 const source=createServer((_req,res)=>{res.writeHead(200,{'content-type':'text/event-stream'});res.write(': opened\n\n');res.once('close',()=>{upstreamClosed=true;});});
 const sourcePort=await listen(source);
 const proxy=createServer((_req,res)=>{
  const call=request({host:'127.0.0.1',port:sourcePort,path:'/'},incoming=>pipeOfficialEventStream(incoming,res,call,async()=>{checks++;if(revoked)throw Error('revoked');},{intervalMs:20}));
  call.setTimeout(80,()=>{timedOut=true;call.destroy(Error('idle timeout'));});
  call.on('error',()=>res.destroy());call.end();
 });
 const proxyPort=await listen(proxy);
 try{
  const response=await fetch('http://127.0.0.1:'+proxyPort,{signal:AbortSignal.timeout(2000)});
  assert.equal(response.headers.get('x-accel-buffering'),'no');assert.equal(response.headers.get('cache-control'),'no-store');
  const reader=response.body!.getReader();const first=await reader.read();assert.match(new TextDecoder().decode(first.value),/opened/);
  await delay(240);assert.equal(timedOut,false);assert.ok(checks>=3);assert.equal(upstreamClosed,false);
  revoked=true;while(!(await reader.read()).done){};
  await delay(30);assert.equal(upstreamClosed,true);const endedAt=checks;await delay(70);assert.equal(checks,endedAt,'heartbeat must stop after closure');
 }finally{await stop(proxy);await stop(source);}
});
test('client disconnect tears down an idle stream and periodic authorization',async()=>{
 let checks=0,closed=false;
 const source=createServer((_req,res)=>{res.writeHead(200,{'content-type':'text/event-stream'});res.write(': ready\n\n');res.once('close',()=>{closed=true;});});const port=await listen(source);
 const proxy=createServer((_req,res)=>{const call=request({host:'127.0.0.1',port,path:'/'},incoming=>pipeOfficialEventStream(incoming,res,call,async()=>{checks++;},{intervalMs:15}));call.on('error',()=>res.destroy());call.end();});const proxyPort=await listen(proxy);
 const controller=new AbortController();
 try{const response=await fetch('http://127.0.0.1:'+proxyPort,{signal:controller.signal});const reader=response.body!.getReader();await reader.read();controller.abort();await delay(60);assert.equal(closed,true);const endedAt=checks;await delay(50);assert.equal(checks,endedAt);}finally{controller.abort();await stop(proxy);await stop(source);}
});

test('a response canceled before upstream headers does not leave a heartbeat or native stream',async()=>{
 let checks=0,closed=false,upstreamStarted=false;
 const source=createServer((_req,res)=>{upstreamStarted=true;const timer=setTimeout(()=>{res.writeHead(200,{'content-type':'text/event-stream'});res.write(': late\n\n');},80);res.once('close',()=>{closed=true;clearTimeout(timer);});});const port=await listen(source);
 const proxy=createServer((_req,res)=>{const call=request({host:'127.0.0.1',port,path:'/'},incoming=>pipeOfficialEventStream(incoming,res,call,async()=>{checks++;},{intervalMs:10}));call.on('error',()=>{});call.end();});const proxyPort=await listen(proxy);
 const controller=new AbortController();
 try{const pending=fetch('http://127.0.0.1:'+proxyPort,{signal:controller.signal}).catch(()=>{});for(let i=0;i<30&&!upstreamStarted;i++)await delay(5);assert.equal(upstreamStarted,true);controller.abort();await pending;await delay(160);assert.equal(closed,true);assert.equal(checks,0);}finally{controller.abort();await stop(proxy);await stop(source);}
});
