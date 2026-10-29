import {AsyncLocalStorage} from 'node:async_hooks';
import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {assistantObjects, assistantCapabilityVersion, assistantFilterOptions, type AssistantObjectType} from '../../../../src/domain/assistantCapabilities';
import {getWorkspaceContext} from '../../../context/workspaceContext';
export class CapabilityError extends Error {
  constructor(public code: string, message: string) {super(message);}
}
export function missing(): never {throw new CapabilityError('OBJECT_NOT_FOUND','找不到当前账号可访问的对象。数据未修改，请重新查找后读取。');}
const id = z.string().trim().min(1).max(160);
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{const d=new Date(v+'T00:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===v;});
const filterShape={classId:id.optional(),studentId:id.optional(),taskId:id.optional(),from:date.optional(),to:date.optional(),status:id.optional(),enrollmentStatus:id.optional(),lifecycle:id.optional(),negativeOnly:z.boolean().optional(),subject:id.optional(),kind:id.optional(),grade:id.optional()};
export const filterSchema=z.object(filterShape).strict().default({}).refine(v=>(!v.from&&!v.to)||(Boolean(v.from&&v.to)&&v.from!<=v.to!&&Date.parse(v.to!)-Date.parse(v.from!)<=30*86400000), '日期须成对且跨度最多31天');
const type=z.enum(Object.keys(assistantObjects) as [AssistantObjectType,...AssistantObjectType[]]);
const page={offset:z.number().int().min(0).max(100000).default(0),limit:z.number().int().min(1).max(50).default(20)};
export const discoverSchema=z.object({type:type.optional()}).strict();
export const searchSchema=z.object({type,query:z.string().trim().max(200).default(''),filters:filterSchema,...page}).strict();
export const readSchema=z.object({textOffset:z.number().int().min(0).max(10000000).default(0),ref:z.object({type,id,parentId:id.optional()}).strict(),section:z.string().max(64).default('detail'),filters:filterSchema,...page}).strict();
export type SearchArgs=z.infer<typeof searchSchema>;
export type ReadArgs=z.infer<typeof readSchema>;
export const assertContext=()=>getWorkspaceContext();
export const ref=(type:AssistantObjectType,id:string,parentId?:string)=>({type,id,...(parentId?{parentId}:{})});
export function validateFilters(type:AssistantObjectType, filters:Record<string,unknown>, read=false) {
  const allowed=new Set<string>(read ? type==='behavior'?['classId','studentId','from','to','kind']:type==='student'?['classId','from','to']:[] : assistantObjects[type].filters);
  const enums:Record<string,readonly string[]>={lifecycle:assistantFilterOptions.lifecycle,enrollmentStatus:assistantFilterOptions.enrollmentStatus};
  if(type==='class')enums.status=assistantFilterOptions.classStatus;
  if(type==='reminder')enums.status=assistantFilterOptions.reminderStatus;
  if(type==='grading')enums.status=assistantFilterOptions.gradingStatus;
  if(type==='resource')enums.kind=assistantFilterOptions.resourceKind;
  if(type==='gradingMaterial')enums.kind=assistantFilterOptions.materialKind;
  for(const [key,values] of Object.entries(enums))if(filters[key]!==undefined&&!values.includes(String(filters[key])))throw new CapabilityError('INVALID_FILTER','筛选值'+key+'不受支持。数据未修改，请检查能力目录。');
  for(const key of Object.keys(filters))if(!allowed.has(key))throw new CapabilityError('INVALID_FILTER','此对象不支持筛选条件'+key+'。数据未修改，请先查看能力目录。');
}
// Bounded projection is a final safeguard, not a replacement for domain pagination.
export const readTextWindow = new AsyncLocalStorage<number>();
export function bounded(value:unknown): {value:any;truncated:boolean;longestText:number} {
  let remaining=50000, truncated=false,longestText=0;const offset=readTextWindow.getStore()??0;
  function visit(v:any,depth=0):any {
    if(depth>20||remaining<=0){truncated=true;return null;}
    if(typeof v==='string'){longestText=Math.max(longestText,v.length);const start=v.length>8000?offset:0;const text=v.slice(start,start+Math.min(remaining,8000));remaining-=text.length;if(start>0||text.length<v.length)truncated=true;return text;}
    if(Array.isArray(v)){if(v.length>100)truncated=true;return v.slice(0,100).map(x=>visit(x,depth+1));}
    if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).filter(([key])=>!['diskPath','filePath','derivedDirectory','rawResponse'].includes(key)).map(([key,x])=>[key,visit(x,depth+1)]));
    return v;
  }
  const result=visit(value);return {value:result,truncated,longestText};
}
export function envelope(data:unknown, source:string, page?:{total:number;offset:number;limit:number}, partial=false) {
  const output=bounded(data);
  return {ok:true,requestId:randomUUID(),observedAt:new Date().toISOString(),capabilityVersion:assistantCapabilityVersion,
    scope:'当前教师工作区；仅本次对象、筛选及分页覆盖的已存记录；不是完整教学事实',
    completeness:partial||output.truncated||(page&&(page.offset>0||page.offset+page.limit<page.total))?'partial':'complete',
    truncated:output.truncated, ...(output.longestText>8000?{textWindow:{offset:readTextWindow.getStore()??0,limit:8000,nextTextOffset:(readTextWindow.getStore()??0)+8000<output.longestText?(readTextWindow.getStore()??0)+8000:null,instruction:'对同一ref、section、offset、limit再次read并传textOffset可续读长文本；总量截断时减小limit。短字段保持不变。'}}:{}), ...(page?{page:{...page,nextOffset:page.offset+page.limit<page.total?page.offset+page.limit:null,consistency:'实时读取；翻页间记录可能变化，非冻结快照'}}:{}),
    data:output.value,sources:[{title:'青松业务记录',url:source}]};
}
export function paged(items:unknown[],args:{offset:number;limit:number},url:string,partial=false,metadata?:unknown) {return envelope({items:items.slice(args.offset,args.offset+args.limit),...(metadata?{metadata}:{})},url,{...args,total:items.length},partial);}
export const matches=(query:string,...values:unknown[])=>!query||values.some(v=>String(v??'').toLocaleLowerCase().includes(query.toLocaleLowerCase()));
