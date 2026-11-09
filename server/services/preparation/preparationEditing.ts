import { randomUUID } from "node:crypto";
import { getWorkspaceContext } from "../../context/workspaceContext";

type Listener = (event: {type:"prepare"|"changed"|"released";documentId?:string;requestId?:string}) => void;
const listeners = new Map<string, Map<string,Listener>>();
const pending = new Map<string,{key:string;documentId:string;waiting:Set<string>;resolve:()=>void;reject:(error:Error)=>void}>();
const notify=(listener:Listener,event:Parameters<Listener>[0])=>{try{listener(event);}catch{/* A disconnected editor cannot interrupt a committed business operation. */}};
const scope = (id:string) => {const c=getWorkspaceContext();return JSON.stringify([c.userId,c.workspaceId,id]);};
export function subscribePreparationEditing(id:string,clientId:string,listener:Listener) {
  const key=scope(id),set=listeners.get(key)??new Map<string,Listener>();set.set(clientId,listener);listeners.set(key,set);
  return ()=>{if(set.get(clientId)===listener)set.delete(clientId);if(!set.size)listeners.delete(key);};
}
export function preparationEditingChanged(id:string) {
  for(const listener of listeners.get(scope(id))?.values()??[])notify(listener,{type:"changed"});
}
/** Visible editors save and become read-only before the task captures its immutable base. */
export async function prepareDocumentEditing(id:string,documentId:string,signal?:AbortSignal) {
  const key=scope(id),clients=listeners.get(key),waiting=new Set(clients?.keys()??[]);
  if(!waiting.size)return;
  const requestId=randomUUID();
  let timer:ReturnType<typeof setTimeout>|undefined;
  const abort=()=>pending.get(requestId)?.reject(new Error("AI 修改准备已取消；教案和草稿保留。"));
  try {
    await new Promise<void>((resolve,reject)=>{
      pending.set(requestId,{key,documentId,waiting,resolve,reject});
      timer=setTimeout(()=>reject(new Error("未能确认页面草稿已保存，本次尚未开始修改。请回到教案确认保存后重试。")),10000);
      signal?.addEventListener("abort",abort,{once:true});
      if(signal?.aborted){abort();return;}
      for(const client of waiting){const listener=clients?.get(client);if(listener)notify(listener,{type:"prepare",documentId,requestId});}
    });
  } finally {
    clearTimeout(timer);signal?.removeEventListener("abort",abort);pending.delete(requestId);
  }
}
export function confirmDocumentEditing(id:string,documentId:string,requestId:string,clientId:string,ok:boolean) {
  const request=pending.get(requestId);
  if(!request||request.key!==scope(id)||request.documentId!==documentId||!request.waiting.delete(clientId))return;
  if(ok){if(!request.waiting.size)request.resolve();}
  else request.reject(new Error("页面草稿尚未保存，本次尚未开始修改。输入仍保留，请先解决保存问题后重试。"));
}
export function releaseDocumentEditing(id:string,documentId:string) {
  for(const listener of listeners.get(scope(id))?.values()??[])notify(listener,{type:"released",documentId});
}
