/** Model-facing business objects, never database tables or arbitrary field paths. */
export const assistantCapabilityVersion = 'qingsong-read-v1';
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
} as const;
export type AssistantObjectType = keyof typeof assistantObjects;
export interface AssistantObjectRef {type: AssistantObjectType; id: string; parentId?: string}

export const assistantFilterOptions = {
 lifecycle:['active','ended','archived'],enrollmentStatus:['active','suspended','transferred','withdrawn'],
 classStatus:['active','archived'],reminderStatus:['active','completed','inactive'],gradingStatus:['pending','running','completed','error'],
 resourceKind:['textbook','supplement','worksheet','lesson-plan','ppt-template','notice','other'],
 materialKind:['assignment','reference-answer','student-submission'],
} as const;
