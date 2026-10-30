import {capabilityFilterFields} from '../../../../src/domain/assistantCapabilityDefinitions.mjs';
import {assistantObjects,assistantCapabilityVersion,assistantFilterOptions} from '../../../../src/domain/assistantCapabilities';
import {readTextWindow,assertContext,parseCapability,validateFilters,CapabilityError,envelope} from './contract';
import {searchTeaching,readTeaching} from './teaching';
import {searchResources,readResources} from './resources';
import {searchGrading,readGrading} from './grading';
export {CapabilityError} from './contract';
export function assistantDiscover(input:unknown){
 assertContext();const a=parseCapability('discover',input);
 return envelope({version:assistantCapabilityVersion,filterOptions:assistantFilterOptions,readLimits:{original:{unit:'page',offset:'0表示第1页',maxLimit:10},dateRequired:['behavior','student.behavior'],gradingMaterialParent:'parentId为所属批改taskId',studentScope:'search包含所有在籍状态；ref.parentId绑定班级'},objects:Object.entries(assistantObjects).filter(([type])=>!a.type||type===a.type).map(([type,spec])=>({type,...spec,readFilters:capabilityFilterFields(type,'read')})),rules:['ref不是权限凭证，每次读取重新鉴权','offset从0开始，limit最多50','日期需成对，跨度最多31天','材料池未选内容不可自主读取','diagnosis无独立存档，读取时明确说明'],excluded:['业务写入','任意SQL或文件路径','主动任务','教案生成']},'/?page=assistant');
}
export function assistantSearch(input:unknown){
 assertContext();const a=parseCapability('search',input);validateFilters(a.type,a.filters);
 if(a.type==='behavior'&&a.query)throw new CapabilityError('INVALID_FILTER','课堂表现暂不支持关键词，请使用学生、日期和项目筛选。数据未修改。');
 return searchTeaching(a)??searchResources(a)??searchGrading(a);
}
export async function assistantRead(input:unknown, signal?:AbortSignal){
 assertContext();const a=parseCapability('read',input);if(a.section==='original'&&(input as {limit?:number}).limit===undefined)a.limit=3;validateFilters(a.ref.type,a.filters,true);
 if(a.ref.type==='student'&&['detail','weaknessEvidence'].includes(a.section)&&(a.filters.from||a.filters.to))throw new CapabilityError('INVALID_FILTER','此学生内容不支持日期筛选，请读取observations、homework、classroom或behavior。数据未修改。');
 if(!(assistantObjects[a.ref.type].sections as readonly string[]).includes(a.section))throw new CapabilityError('SECTION_UNSUPPORTED','section不支持“'+a.section+'”。数据未修改。',{recovery:'correct_arguments',issues:[{field:'section',problem:'此对象不支持该内容',allowedValues:[...assistantObjects[a.ref.type].sections]}],nextAction:'使用该对象允许的section，或先discover查看内容目录。'});
 return readTextWindow.run(a.textOffset,async()=>readTeaching(a)??await readResources(a,signal)??readGrading(a));
}
export function assistantCapability(action:string,input:unknown, signal?:AbortSignal){
 if(action==='discover')return assistantDiscover(input);
 if(action==='search')return assistantSearch(input);
 if(action==='read')return assistantRead(input,signal);
 throw new CapabilityError('CAPABILITY_UNSUPPORTED','此动作尚未开放。数据未修改，请查看能力目录。');
}
