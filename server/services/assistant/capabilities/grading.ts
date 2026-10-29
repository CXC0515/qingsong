import {getVisionValidationResult} from '../../../repositories/visionValidationRepository';
import {listGradingTasks} from '../../../repositories/gradingTaskRepository';
import {getMaterials} from '../../../repositories/materialRepository';
import {getFirstSectionAnalysis} from '../../../repositories/analysisRepository';
import {getTaskRubrics} from '../../../repositories/gradingRubricRepository';
import {getTrialGradingResult} from '../../../repositories/trialGradingRepository';
import {getGradingBatch} from '../../../repositories/gradingBatchRepository';
import {CapabilityError,missing,matches,ref,paged,envelope,type SearchArgs,type ReadArgs} from './contract';
const url='/api/grading-task-list';
function task(id:string){const t=listGradingTasks().find(t=>t.id===id);if(!t)missing();return t;}
export function searchGrading(a:SearchArgs){
 if(a.type==='grading')return paged(listGradingTasks().filter(t=>(!a.filters.classId||t.classId===a.filters.classId)&&(!a.filters.status||t.status===a.filters.status)&&matches(a.query,t.name,t.className)).map(t=>({...t,ref:ref('grading',t.id)})),a,url);
 if(a.type==='gradingMaterial'){
  if(!a.filters.taskId)throw new CapabilityError('TASK_REQUIRED','请先查找批改任务并提供taskId。数据未修改。');task(a.filters.taskId);
  return paged(getMaterials(a.filters.taskId).filter(m=>(!a.filters.kind||m.kind===a.filters.kind)&&matches(a.query,m.fileName)).map(m=>({ref:ref('gradingMaterial',m.id,m.taskId),name:m.fileName,kind:m.kind,status:m.status,pageCount:m.pageCount})),a,url);
 }
}
function absent(section:string):never {throw new CapabilityError('RESULT_NOT_RECORDED','尚未找到'+section+'的已存结果。数据未修改；不能据此推断学生没有作业或没有表现，请到批改页面核对。');}
export function readGrading(a:ReadArgs){
 const {id,parentId,type}=a.ref;
 if(type==='gradingMaterial'){
  if(!parentId)missing();task(parentId);
  const m=getMaterials(parentId).find(m=>m.id===id);if(!m)missing();
  if(a.section==='validation'){const result=getVisionValidationResult(parentId,id);if(!result)absent('识别复核');const {items,...meta}=result;return paged(items,a,'/api/grading-tasks/'+encodeURIComponent(parentId)+'/vision-validation/'+encodeURIComponent(id),false,{...meta,scope:'仅返回当前识别流程版本的已有复核项，与业务页面一致。'});}
  if(a.section==='blocks'||a.section==='pages'){
   if(!m.normalizedDocument)absent('材料解析');
   const blocks=m.normalizedDocument.blocks;
   if(a.section==='blocks')return paged(blocks,a,m.publicUrl,m.status!=='ready');
   const pageNumbers=[...new Set(blocks.map(b=>b.pageNumber??1))].sort((x,y)=>x-y);
   return paged(pageNumbers.map(page=>({pageNumber:page,blocks:blocks.filter(b=>(b.pageNumber??1)===page),sourceUrl:m.publicUrl+'#page='+page})),a,m.publicUrl,true);
  }
  return envelope({id:m.id,taskId:m.taskId,kind:m.kind,fileName:m.fileName,mimeType:m.mimeType,pageCount:m.pageCount,status:m.status,parseErrorCode:m.parseErrorCode,publicUrl:m.publicUrl,parsedAt:m.normalizedDocument?.parsedAt,warnings:m.normalizedDocument?.warnings},m.publicUrl);
 }
 if(type==='grading'){
  const t=task(id);const source='/api/grading-tasks/'+encodeURIComponent(id)+'/'+({analysis:'analysis',rubrics:'rubrics',trial:'trial-grading',batch:'batch-grading',materials:'materials'}[a.section]??'materials');
  if(a.section==='materials')return searchGrading({...a,type:'gradingMaterial',query:'',filters:{taskId:id}});
  if(a.section==='analysis'){const result=getFirstSectionAnalysis(id);if(!result)absent('题目分析');const {questions,...meta}=result;return paged(questions,a,source,false,meta);}
  if(a.section==='rubrics')return paged(getTaskRubrics(id),a,source);
  if(a.section==='trial'){const result=getTrialGradingResult(id);if(!result)absent('试批');const {samples,...meta}=result;return paged(samples,a,source,false,{...meta,interpretation:'保留每条记录的AI结果、教师复核和来源状态；AI分数不自动代表终审分数。'});}
  if(a.section==='batch'){const result=getGradingBatch(id);if(!result)absent('批量批改');return envelope(result,source);}
  if(a.section==='diagnosis')throw new CapabilityError('RESULT_NOT_PERSISTED','诊断当前按需计算，没有独立保存的诊断记录。数据未修改，请读取题目分析及试批结果作为依据，或到页面查看诊断；本工具不触发重新计算或批改。');
  return envelope(t,source);
 }
}
