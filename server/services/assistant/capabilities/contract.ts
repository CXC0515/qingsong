import {AsyncLocalStorage} from 'node:async_hooks';
import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {assistantObjects, assistantCapabilityVersion, assistantFilterOptions, type AssistantObjectType} from '../../../../src/domain/assistantCapabilities';
import {capabilityFilterFields,capabilityArgumentDefinitions,capabilityArgumentIssues,invalidCapabilityArguments} from '../../../../src/domain/assistantCapabilityDefinitions.mjs';
import {getWorkspaceContext} from '../../../context/workspaceContext';
export class CapabilityError extends Error {
  constructor(public code: string, message: string, public guidance?: {recovery?:string;issues?:unknown[];nextAction?:string}) {super(message);}
  toFailure(){
    const parameterError=['INVALID_QUERY','INVALID_FILTER','SECTION_UNSUPPORTED','DATE_RANGE_REQUIRED','TASK_REQUIRED','INVALID_RANGE','CAPABILITY_UNSUPPORTED'].includes(this.code);
    return {code:this.code,message:this.message,recovery:parameterError?'correct_arguments':'clarify',nextAction:parameterError?'按错误说明修正参数，不确定时调用qingsong_discover({})。':'停止原样重复此读取，核对对象和已有结果；可改查其他已开放内容或向教师确认。',...this.guidance};
  }
}
export function missing(): never {throw new CapabilityError('OBJECT_NOT_FOUND','找不到当前账号可访问的对象。数据未修改，请重新查找后读取。',{recovery:'clarify',nextAction:'重新search核对对象；查不到时请教师核对范围，不要反复读取同一编号。'});}
export interface CapabilityFilters extends Record<string,unknown> {classId?:string;studentId?:string;taskId?:string;from?:string;to?:string;status?:string;enrollmentStatus?:string;lifecycle?:string;negativeOnly?:boolean;subject?:string;kind?:string;grade?:string;onDate?:string;weekday?:number;scope?:'teacher'|'class'}
export interface SearchArgs {type:AssistantObjectType;query:string;filters:CapabilityFilters;offset:number;limit:number}
export interface ReadArgs {ref:{type:AssistantObjectType;id:string;parentId?:string};section:string;filters:CapabilityFilters;offset:number;limit:number;textOffset:number}
function fromDefinition(spec:any):z.ZodType {
 let schema:any;
 if(spec.type==='object')schema=z.object(Object.fromEntries(Object.entries(spec.properties??{}).map(([key,value])=>[key,fromDefinition(value)]))).strict();
 else if(spec.type==='string'){
  schema=spec.enum?z.enum(spec.enum):z.string();if(spec.trim&&!spec.enum)schema=schema.trim();
  if(!spec.enum){if(spec.minLength!==undefined)schema=schema.min(spec.minLength);if(spec.maxLength!==undefined)schema=schema.max(spec.maxLength);if(spec.pattern)schema=schema.regex(new RegExp(spec.pattern));}
 }else if(spec.type==='integer'){schema=z.number().int();if(spec.minimum!==undefined)schema=schema.min(spec.minimum);if(spec.maximum!==undefined)schema=schema.max(spec.maximum);}
 else schema=z.boolean();
 if(Object.hasOwn(spec,'default'))return schema.default(spec.default);
 return spec.required?schema:schema.optional();
}
const build=(action:string)=>z.object(Object.fromEntries(Object.entries(capabilityArgumentDefinitions[action]).map(([key,spec])=>[key,fromDefinition(spec)]))).strict();
export const discoverSchema=build('discover') as z.ZodType<{type?:AssistantObjectType}>;
export const searchSchema=build('search') as unknown as z.ZodType<SearchArgs>;
export const readSchema=build('read') as unknown as z.ZodType<ReadArgs>;
export function parseCapability(action:'discover',input:unknown):{type?:AssistantObjectType};
export function parseCapability(action:'search',input:unknown):SearchArgs;
export function parseCapability(action:'read',input:unknown):ReadArgs;
export function parseCapability(action:'discover'|'search'|'read',input:unknown){
 const issues=capabilityArgumentIssues(action,input);
 if(issues.length){const failure=invalidCapabilityArguments(issues);throw new CapabilityError(failure.code,failure.message,failure);}
 return {discover:discoverSchema,search:searchSchema,read:readSchema}[action].parse(input);
}
export const assertContext=()=>getWorkspaceContext();
export const ref=(type:AssistantObjectType,id:string,parentId?:string)=>({type,id,...(parentId?{parentId}:{})});
export function validateFilters(type:AssistantObjectType, filters:Record<string,unknown>, read=false) {
  if(type==='schedule'&&filters.onDate!==undefined&&filters.weekday!==undefined)throw new CapabilityError('INVALID_FILTER','onDate与weekday只能提供一个。数据未修改，请保留日期或星期条件。');
  const allowed=new Set<string>(capabilityFilterFields(type,read?'read':'search'));
  const enums:Record<string,readonly string[]>={lifecycle:assistantFilterOptions.lifecycle,enrollmentStatus:assistantFilterOptions.enrollmentStatus};
  if(type==='class')enums.status=assistantFilterOptions.classStatus;
  if(type==='reminder')enums.status=assistantFilterOptions.reminderStatus;
  if(type==='grading')enums.status=assistantFilterOptions.gradingStatus;
  if(type==='resource')enums.kind=assistantFilterOptions.resourceKind;
  if(type==='gradingMaterial')enums.kind=assistantFilterOptions.materialKind;
  for(const [key,values] of Object.entries(enums))if(filters[key]!==undefined&&!values.includes(String(filters[key])))throw new CapabilityError('INVALID_FILTER','filters.'+key+'的取值不受支持。数据未修改。允许：'+values.join('、'),{recovery:'correct_arguments',issues:[{field:'filters.'+key,problem:'不支持的取值',allowedValues:values}],nextAction:'按该对象允许的筛选值修改后再调用。'});
  for(const key of Object.keys(filters))if(!allowed.has(key))throw new CapabilityError('INVALID_FILTER','此对象不支持filters.'+key+'。数据未修改。',{recovery:'correct_arguments',issues:[{field:'filters.'+key,problem:'该对象不支持的筛选项',allowedFields:[...allowed]}],nextAction:'移除不支持的筛选项；按discover给出的当前对象条件查询。'});
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
