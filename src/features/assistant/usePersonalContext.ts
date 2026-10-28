import {useCallback,useEffect,useRef,useState} from 'react';
import {apiFetch} from '../../services/apiClient';
import type {InstructionDocument,PersonalEntry} from '../../domain/personalContext';
const message=(e:unknown)=>e instanceof TypeError||e instanceof SyntaxError?'连接中断，保存结果尚未确认。已有记录保留，请用原操作重试或刷新核对。':e instanceof Error?e.message:'个人记录未能确认，请重试。';
export function usePersonalContext(active:boolean){
  const [data,setData]=useState<{entries:PersonalEntry[];document:InstructionDocument}>({entries:[],document:{content:'',revision:''}});
  const [loading,setLoading]=useState(false),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const sequence=useRef(0),alive=useRef(true),inFlight=useRef(false),pending=useRef<{key:string;id:string}|null>(null);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;sequence.current++;};},[]);
  const refresh=useCallback(async(signal?:AbortSignal)=>{const id=++sequence.current;const r=await apiFetch('/api/assistant/personal-context',{signal});const result=await r.json();if(!r.ok)throw Error(result.message||'个人记录未载入，请刷新重试。');if(alive.current&&!signal?.aborted&&id===sequence.current){setData(result);setLoaded(true);}},[]);
  useEffect(()=>{if(!active)return;const controller=new AbortController();setLoading(true);void refresh(controller.signal).catch(e=>{if(!controller.signal.aborted)setError(message(e));}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[active,refresh]);
  const mutate=async(path:string,method:string,fields:Record<string,unknown>)=>{
    if(inFlight.current)return false;inFlight.current=true;setBusy(true);setError('');setNotice('');
    const key=JSON.stringify({path,method,fields});if(pending.current?.key!==key)pending.current={key,id:crypto.randomUUID()};
    try{const r=await apiFetch('/api/assistant/personal-context'+path,{method,headers:{'content-type':'application/json'},body:JSON.stringify({...fields,operationId:pending.current.id})});const result=await r.json();if(!r.ok)throw Error(result.message||'记录未保存，请核对后重试。');pending.current=null;setNotice('已保存，后续助手请求使用最新生效内容。');try{await refresh();}catch{setError('已保存，但最新列表未载入。请刷新核对，勿重复新增。');}return true;}catch(e){if(alive.current)setError(message(e));return false;}finally{inFlight.current=false;if(alive.current)setBusy(false);}
  };
  return {...data,loading,loaded,busy,error,notice,setError,refresh,mutate};
}
