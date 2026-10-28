import type {ClientRequest,IncomingMessage,ServerResponse} from 'node:http';
/** Keep an authenticated SSE stream live without buffering its first event. */
export function pipeOfficialEventStream(incoming:IncomingMessage,response:ServerResponse,upstream:ClientRequest,authorize:()=>Promise<void>,options:{intervalMs?:number;onHeartbeat?:()=>void}={}){
  if(response.destroyed||response.writableEnded||incoming.destroyed){upstream.destroy();incoming.destroy();return()=>{};}
  upstream.setTimeout(0);
  response.setHeader('Content-Type',incoming.headers['content-type']??'text/event-stream');
  response.setHeader('Cache-Control','no-store');
  response.setHeader('X-Accel-Buffering','no');
  response.flushHeaders();
  let closed=false,checking=false;
  const close=()=>{if(closed)return;closed=true;clearInterval(timer);incoming.unpipe(response);upstream.destroy();if(!response.destroyed)response.end();};
  const timer=setInterval(async()=>{
    if(closed||checking)return;checking=true;
    try{await authorize();if(!closed&&!response.destroyed){options.onHeartbeat?.();response.write(': qingsong keep-alive\n\n');}}
    catch{close();}finally{checking=false;}
  },options.intervalMs??15000);timer.unref();
  response.once('close',close);incoming.once('end',close);incoming.once('error',close);
  if(response.destroyed||incoming.destroyed)close();else incoming.pipe(response);
  return close;
}
