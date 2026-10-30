import {createHash} from 'node:crypto';
import {capabilityArgumentIssues,invalidCapabilityArguments} from '../src/domain/assistantCapabilityDefinitions.mjs';
export class ReadToolFailure extends Error {
 constructor(failure){super(failure.message);this.name='ReadToolFailure';this.code=failure.code;this.failure=failure;}
}
export function readFailure(error,signal){
 if(error instanceof ReadToolFailure)return error.failure;
 if(signal?.aborted)return {code:'TURN_CANCELLED',message:'本轮读取已取消，数据未修改。需要时请重新提问。',recovery:'stop',nextAction:'停止本轮读取。'};
 return {code:'READ_SERVICE_UNAVAILABLE',message:'读取服务暂时未完成，数据未修改。可重试一次；仍失败时请到对应业务页面核对。',recovery:'retry_once',nextAction:'可原参数重试一次，仍失败则说明未完成并提供业务页面核对方式。'};
}
export function httpReadFailure(body,status){
 const code=typeof body?.code==='string'?body.code:'READ_SERVICE_UNAVAILABLE';
 const stop=['AUTH_EXPIRED','ACCESS_DENIED','DATA_CORRUPT','DATA_READ_FAILED','TURN_CANCELLED','CLOSING'];
 const recovery=stop.includes(code)||status===401||status===403?'stop':status===429||status>=500?'retry_once':['correct_arguments','clarify','retry_once','stop'].includes(body?.recovery)?body.recovery:'correct_arguments';
 return {code,message:body?.message||'读取未完成，数据未修改，请核对后重试。',recovery,...(Array.isArray(body?.issues)?{issues:body.issues}:{}),nextAction:body?.nextAction||(recovery==='stop'?'停止读取；权限错误先核对登录和访问范围，数据异常请联系管理员。':recovery==='retry_once'?'可重试一次，仍失败则停止并说明原因。':'按错误提示修改参数；不确定时调用qingsong_discover({})。')};
}
function fingerprint(tool,args){
 const sort=value=>Array.isArray(value)?value.map(sort):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sort(value[key])])):value;
 return createHash('sha256').update(JSON.stringify([tool,sort(args)])).digest('hex');
}
export async function executeCapability({state,action,args,exec,execute}){
 const remember=failure=>{if(state){state.toolFailures??=new Map();state.toolFailures.set(exec.callId,failure);}throw new ReadToolFailure(failure);};
 if(!state)return remember({code:'TURN_NOT_ACTIVE',message:'读取轮次已经结束，数据未修改，请重新提问。',recovery:'stop'});
 if(++state.queries>12)return remember({code:'TOOL_BUDGET_EXHAUSTED',message:'本轮读取次数已达上限，数据未修改。请缩小问题范围后继续。',recovery:'stop'});
 state.failedCalls??=new Map();
 const key=fingerprint('qingsong_'+action,args),prior=state.failedCalls.get(key);
 if(state.stopReading)return remember({...state.stopReading,nextAction:'本轮读取已停止；请先处理上述权限、取消或数据错误。'});
 if(prior&&(prior.failure.recovery!=='retry_once'||prior.count>=2))return remember({code:'REPEATED_TOOL_FAILURE',message:'相同工具和参数已经失败，本次未重复请求，数据未修改。请根据上一条错误修正参数、核对对象或停止查询。',recovery:'correct_arguments',previousFailure:prior.failure,nextAction:'不要原样重试。修正参数后再调用；需要查能力时用qingsong_discover({})。'});
 try{
  exec.signal?.throwIfAborted();
  const issues=capabilityArgumentIssues(action,args);
  if(issues.length)throw new ReadToolFailure(invalidCapabilityArguments(issues));
  const result=await execute();state.failedCalls.delete(key);return result;
 }catch(error){
  const failure=readFailure(error,exec.signal);
  state.failedCalls.set(key,{failure,count:(prior?.count??0)+1});
  if(failure.recovery==='stop')state.stopReading=failure;
  return remember(failure);
 }
}
