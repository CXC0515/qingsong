/** Model-facing business objects, never database tables or arbitrary field paths. */
export const assistantCapabilityVersion = 'qingsong-read-v2';
export const assistantObjects = {
  class: {label:'班级', filters:['status'], sections:['detail','students','seating','summary']},
  student: {label:'学生档案', filters:['classId','enrollmentStatus'], sections:['detail','observations','homework','weaknessEvidence','classroom','behavior']},
  classroomTask: {label:'课堂任务', filters:['classId','from','to','lifecycle','negativeOnly'], sections:['detail','participants','events']},
  behavior: {label:'课堂表现（必须提供from/to）', filters:['classId','studentId','from','to','kind'], sections:['detail']},
  project: {label:'课堂记录项目', filters:[], sections:['detail']},
  schedule: {label:'课程', filters:['classId'], sections:['detail','periods']},
  reminder: {label:'提醒与日程', filters:['classId','from','to','status'], sections:['detail']},
  resource: {label:'资源与教材（query搜索标题及已解析正文）', filters:['subject','kind','grade'], sections:['detail','chunks','pages','original','jobs','suggestions']},
  knowledge: {label:'知识节点', filters:['subject','kind'], sections:['detail','relations','sources','children','revisions','context']},
  grading: {label:'批改任务', filters:['classId','status'], sections:['detail','materials','analysis','rubrics','trial','batch','diagnosis']},
  gradingMaterial: {label:'批改材料与已解析原文（必须提供taskId）', filters:['taskId','kind'], sections:['detail','blocks','pages','validation']},
};
export const assistantFilterOptions = {
 lifecycle:['active','ended','archived'],enrollmentStatus:['active','suspended','transferred','withdrawn'],
 classStatus:['active','archived'],reminderStatus:['active','completed','inactive'],gradingStatus:['pending','running','completed','error'],
 resourceKind:['textbook','supplement','worksheet','lesson-plan','ppt-template','notice','other'],
 materialKind:['assignment','reference-answer','student-submission'],
};

export const objectTypeDescription = '业务对象类型：'+Object.entries(assistantObjects).map(([key,value])=>`${key}=${value.label}`).join('；')+'。schedule只查课程/课表；reminder查待办、提醒、办事安排。不要把“日程”自动当作其中任何一种。';
const id = description=>({type:'string',minLength:1,maxLength:160,trim:true,description});
const date = {type:'string',pattern:'^\\d{4}-\\d{2}-\\d{2}$',format:'date',description:'真实日期YYYY-MM-DD，from/to需同时提供，跨度最多31天'};
const filters = {
 classId:id('班级编号，先查询班级取得'),studentId:id('学生编号，先查询学生取得'),taskId:id('批改任务编号，先查询grading取得'),
 from:date,to:date,status:{type:'string',minLength:1,maxLength:160,trim:true,description:'对象状态，取值以discover中该对象的filterOptions为准'},
 enrollmentStatus:{type:'string',enum:assistantFilterOptions.enrollmentStatus,description:'学生在籍状态'},
 lifecycle:{type:'string',enum:assistantFilterOptions.lifecycle,description:'课堂任务生命周期'},
 negativeOnly:{type:'boolean',description:'是否只查有负向结果的课堂任务'},subject:id('学科名称'),kind:id('资料类型、材料类型或课堂项目；以该对象目录为准'),grade:id('年级名称'),
};
const type = {type:'string',enum:Object.keys(assistantObjects),description:objectTypeDescription};
const paging = {
 offset:{type:'integer',minimum:0,maximum:100000,default:0,description:'从0开始的分页偏移；original中0表示第1页'},
 limit:{type:'integer',minimum:1,maximum:50,default:20,description:'每页最多50项；original每次最多10页、默认3页'},
};
export const capabilityArgumentDefinitions = {
 discover:{type},
 search:{type:{...type,required:true},query:{type:'string',trim:true,maxLength:200,default:'',description:'按姓名、学号、标题或正文查找，不填表示列举'},filters:{type:'object',properties:filters,default:{},additionalProperties:false,description:'仅使用当前对象支持的筛选项，先查看discover'},...paging},
 read:{ref:{type:'object',required:true,additionalProperties:false,description:'search返回的ref原样传入；不是字符串编号',properties:{type:{...type,required:true},id:{...id('对象真实编号'),required:true},parentId:id('学生的所属班级、课堂任务的班级或批改材料的taskId，按search返回保留')}},
 section:{type:'string',enum:[...new Set(Object.values(assistantObjects).flatMap(object=>object.sections))],maxLength:64,default:'detail',description:'要读取的内容，取值以该对象的sections为准；默认detail'},
 filters:{type:'object',properties:filters,default:{},additionalProperties:false,description:'读取仅支持学生和课堂表现的明确筛选条件，以discover为准'},...paging,
 textOffset:{type:'integer',minimum:0,maximum:10000000,default:0,description:'长文本续读偏移，按上次textWindow.nextTextOffset填写'}},
};
// DSH rc.3 supports scalar types/enums and annotations, but not numeric or string bounds.
// Keep those limits in the same source and project them into descriptions; execute still validates them.
export function capabilityToolParameters(action){
 const project=spec=>{
  const {minLength,maxLength,minimum,maximum,pattern,format,trim,properties,...native}=spec;
  const limits=[minLength!==undefined&&`至少${minLength}字符`,maxLength!==undefined&&`最多${maxLength}字符`,minimum!==undefined&&`最小${minimum}`,maximum!==undefined&&`最大${maximum}`,format==='date'&&'日期格式YYYY-MM-DD'].filter(Boolean);
  if(limits.length)native.description=[native.description,...limits].filter(Boolean).join('；');
  if(properties)native.properties=Object.fromEntries(Object.entries(properties).map(([key,value])=>[key,project(value)]));
  return native;
 };
 return Object.fromEntries(Object.entries(capabilityArgumentDefinitions[action]).map(([key,value])=>[key,project(value)]));
}

/** Validation is shared by the executable adapter and the backend, not a model-only hint. */
export function capabilityArgumentIssues(action,input){
 const definitions=capabilityArgumentDefinitions[action];const issues=[];
 if(!definitions)return [{field:'action',problem:'不支持的工具动作'}];
 function visit(spec,value,field){
  if(value===undefined){if(spec.required)issues.push({field,problem:'缺少必填字段'});return;}
  const valid=spec.type==='object'?value!==null&&typeof value==='object'&&!Array.isArray(value):spec.type==='integer'?Number.isSafeInteger(value):typeof value===spec.type;
  if(!valid){issues.push({field,problem:'数据类型不正确',expected:spec.type});return;}
  if(spec.trim&&typeof value==='string')value=value.trim();
  if(spec.enum&&!spec.enum.includes(value)){issues.push({field,problem:'不支持的取值',received:typeof value==='string'?value.slice(0,64):value,allowedValues:spec.enum});return;}
  if(spec.type==='object'){checkObject(spec.properties??{},value,field);return;}
  if(spec.type==='string'){
   if(value.length<(spec.minLength??0)||value.length>(spec.maxLength??Infinity))issues.push({field,problem:'文本长度不符合要求',minimum:spec.minLength,maximum:spec.maxLength});
   if(spec.format==='date'){const d=new Date(value+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(+d)||d.toISOString().slice(0,10)!==value)issues.push({field,problem:'必须是有效日期YYYY-MM-DD'});}
  }
  if(spec.type==='integer'&&(value<spec.minimum||value>spec.maximum))issues.push({field,problem:'超出允许范围',minimum:spec.minimum,maximum:spec.maximum});
 }
 function checkObject(properties,value,path){
  for(const key of Object.keys(value))if(!Object.hasOwn(properties,key))issues.push({field:path?path+'.'+key:key,problem:'不支持的字段'});
  for(const [key,spec] of Object.entries(properties))visit(spec,value[key],path?path+'.'+key:key);
 }
 if(!input||typeof input!=='object'||Array.isArray(input))return [{field:'arguments',problem:'参数必须是JSON对象'}];
 checkObject(definitions,input,'');
 const f=input.filters;
 if(f&&typeof f==='object'&&(f.from||f.to)&&!issues.some(issue=>issue.field.startsWith('filters.'))){
  if(!f.from||!f.to||f.from>f.to||Date.parse(f.to)-Date.parse(f.from)>30*86400000)issues.push({field:'filters',problem:'起止日期需同时提供，结束不早于开始，跨度最多31天'});
 }
 return issues.slice(0,8);
}
export function invalidCapabilityArguments(issues){
 const hint=issues.some(issue=>['type','ref.type'].includes(issue.field))?'课表/课程用schedule，待办/提醒/办事安排用reminder；其他类型查看qingsong_discover({})。不要自动把“日程”映射成某一种。':'请按字段说明修改参数；不确定时先查看qingsong_discover({})。';
 return {code:'INVALID_QUERY',message:issues.map(issue=>`${issue.field}：${issue.problem}${issue.received!==undefined?'（收到“'+issue.received+'”）':''}`).join('；')+'。教学数据未修改。'+hint,
  recovery:'correct_arguments',issues,nextAction:hint};
}

export function capabilityFilterFields(type,action='search'){
 if(action==='read')return ({student:['classId','from','to'],behavior:['classId','studentId','from','to','kind']})[type]??[];
 return assistantObjects[type]?.filters??[];
}
