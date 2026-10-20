import { apiFetch } from './apiClient';
import { ClassroomTaskError } from './classroomTaskApi';
import type { BehaviorEvent, BehaviorInput, BehaviorList } from '../domain/classroomBehavior';
async function request<T>(url:string,input?:unknown):Promise<T>{
  let response:Response;
  try{response=await apiFetch(url,{...(input?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}:{}),signal:AbortSignal.timeout(20000)});}catch{throw new ClassroomTaskError(0,'RESULT_UNKNOWN',input?'尚未确认这笔表现是否保存，请核对后重试。':'读取失败，请重试。');}
  const data=await response.json().catch(()=>null);
  if(!response.ok)throw new ClassroomTaskError(response.status,data?.code??'REQUEST_FAILED',response.status===401?'登录已失效，已保存记录不受影响，请重新登录后核对。':data?.message??'操作未完成，请重新读取核对。');
  if(!data)throw new ClassroomTaskError(0,'RESULT_UNKNOWN','未读取到保存确认，请先核对。');return data;
}
export const behaviorApi={
  list:(filter:{classId?:string;studentId?:string;from:string;to:string;offset?:number;limit?:number})=>request<BehaviorList>('/api/classroom-behavior?'+new URLSearchParams(Object.entries(filter).map(([k,v])=>[k,String(v)]))),
  record:(input:BehaviorInput)=>request<BehaviorEvent>('/api/classroom-behavior',input),
  operation:(id:string)=>request<BehaviorEvent>('/api/classroom-behavior/operations/'+encodeURIComponent(id)),
};
