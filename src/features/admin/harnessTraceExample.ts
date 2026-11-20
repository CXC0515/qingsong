import type {TraceEvent} from './HarnessConfig';
import {toolDefinition} from '../../domain/harnessToolDefinitions.mjs';

// UI-only fixture. Never persisted or submitted to the execution bridge.
export const exampleRunId='example:schedule-review';
export function createTraceExample():TraceEvent[]{
 const entries:Array<{node:string;title:string;status?:string;callId?:string;data:Record<string,unknown>}>= [
  {node:'orchestrator',title:'收到教师请求',data:{message:'看看明天下午的课表，找个空档提醒我批改作文。',session:'模拟会话',budget:{steps:8,queries:12,timeoutMs:180000}}},
  {node:'guard',title:'检查身份与运行预算',data:{checkpoint:'agent/pre-step',decision:'allow',workspace:'模拟工作区',step:1}},
  {node:'memory',title:'筛选相关记忆',data:{query:'课表与批改作文提醒',candidates:[{content:'习惯在下午批改作文',score:0.83,selected:true},{content:'喜欢古典音乐',score:0.31,selected:false}],selected:['习惯在下午批改作文']}},
  {node:'context',title:'组装本轮上下文',data:{date:'2026-11-21',timezone:'Asia/Shanghai',personalRules:['推测时间须先征求确认'],memories:['习惯在下午批改作文'],materials:[]}},
  {node:'router',title:'披露 Skill 摘要',data:{provider:'qingsong-business',skills:[{name:'system-data',description:'查找并读取教师业务数据'}]}},
  {node:'agent',title:'决定读取业务数据',data:{action:'load_skill',name:'system-data'}},
  {node:'skills',title:'加载 Skill 正文',callId:'example-skill-1',data:{name:'system-data',content:'# 业务数据读取\n先发现业务能力，再检索目标对象并按需读取。权限以工具回执为准。',referenceFiles:[]}},
  {node:'tools',title:'披露本轮工具定义',data:{tools:['qingsong_discover','qingsong_search','qingsong_schedule'].map(toolDefinition)}},
  {node:'tools',title:'发现课表查询能力',callId:'example-discover-1',data:{tool:'qingsong_discover',arguments:{},result:{objects:[{type:'schedule',filters:['onDate','scope']}]},durationMs:63}},
  {node:'guard',title:'放行课表查询',callId:'example-search-1',data:{checkpoint:'tools.guard',tool:'qingsong_search',decision:{kind:'allow'},scope:'当前教师课表'}},
  {node:'tools',title:'查询明日下午课表',callId:'example-search-1',data:{tool:'qingsong_search',arguments:{type:'schedule',filters:{onDate:'2026-11-22',scope:'mine'}},result:{items:[{title:'语文课',startAt:'2026-11-22T14:00:00+08:00',endAt:'2026-11-22T14:45:00+08:00'}],complete:true},durationMs:126}},
  {node:'context',title:'接收查询结果',data:{toolResult:'14:00 至 14:45 有语文课',scheduleWrites:[],timeConfirmed:false}},
  {node:'agent',title:'生成候选回答',data:{candidate:'明天下午 15:00 有空，已为你创建批改作文提醒。'}},
  {node:'verify',title:'发现未经回执确认的创建声明',status:'error',data:{candidate:'明天下午 15:00 有空，已为你创建批改作文提醒。',passed:false,issues:[{rule:'保存状态以工具回执为准',evidence:'本轮只有课表查询，没有日程创建回执。'},{rule:'推测时间须先确认',evidence:'教师没有确认 15:00。'}],nextAction:'仅修订回答，不执行日程写入'}},
  {node:'agent',title:'依据校验结果修订回答',data:{repairAttempt:1,toolsAllowed:false,candidate:'明天下午 14:00 至 14:45 有语文课。可以考虑 15:00 批改作文，要安排在这个时间吗？提醒尚未创建。'}},
  {node:'verify',title:'修订回答通过校验',data:{passed:true,repairAttempt:1,checks:{supportedByEvidence:true,creationClaimMatchesReceipt:true,requestsTimeConfirmation:true}}},
  {node:'output',title:'交付修订回答',data:{message:'明天下午 14:00 至 14:45 有语文课。可以考虑 15:00 批改作文，要安排在这个时间吗？提醒尚未创建。',turnStatus:'completed',scheduleSaved:false}},
 ];
 return entries.map((entry,index)=>({seq:index+1,at:new Date(Date.UTC(2026,10,21,7,0,index)).toISOString(),revision:0,status:'ok',...entry,data:{simulated:true,...entry.data}}));
}
