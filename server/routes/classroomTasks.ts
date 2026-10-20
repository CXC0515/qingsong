import { listRecordProjects, createRecordProject, queryRecordProject } from '../services/classroom/classroomTaskService';
import { createRecordProjectSchema } from '../schemas/classroomTask';
import { quickContextSchema, quickRecordSchema } from '../schemas/classroomTask';
import { readQuickContext, recordQuick } from '../services/classroom/classroomTaskService';
/** @license SPDX-License-Identifier: Apache-2.0 */
import { Router, type Request, type Response } from 'express';
import { getWorkspaceContext } from '../context/workspaceContext';
import { commitTaskSchema, createTaskSchema, taskOperationPreviewSchema, taskOperationSchema } from '../schemas/classroomTask';
import { applyClassroomOperation, classroomTaskSummary, ClassroomTaskError, createClassroomTask, listClassroomTasks, previewClassroomOperation, previewTaskCreation, queryClassroomOperation, requireTask, studentClassroomTasks } from '../services/classroom/classroomTaskService';
const router = Router();
const handle = (callback:(request:Request)=>unknown) => (request:Request,response:Response) => {
  try { getWorkspaceContext(); response.json(callback(request)); }
  catch (error) {
    if (error instanceof ClassroomTaskError) { response.status(error.status).json({code:error.code,message:error.message,saved:false}); return; }
    if (error instanceof Error && error.message === 'WORKSPACE_CONTEXT_REQUIRED') { response.status(401).json({code:'AUTH_REQUIRED',message:'登录已失效，请重新登录后核对提交结果。'}); return; }
    console.error('[classroom-tasks]', error instanceof Error ? error.name : 'UnknownError');
    response.status(500).json({code:'CLASSROOM_TASK_FAILED',message:'暂时无法完成操作，请保留操作编号并核对提交结果。',saved:'unknown'});
  }
};
const parsed = <T>(schema:{safeParse:(value:unknown)=>{success:boolean;data?:T}},body:unknown):T => {
  const result = schema.safeParse(body); if (!result.success) throw new ClassroomTaskError('INVALID_TASK_INPUT',400,'输入格式不正确，本次未保存，请检查日期、名称和记录内容。'); return result.data!;
};
const page = (value:unknown,fallback:number,max:number) => { const result = Number(value ?? fallback); return Number.isInteger(result) && result >= 0 ? Math.min(result,max) : fallback; };
router.get('/classroom-tasks',handle(request => listClassroomTasks({classId:typeof request.query.classId === 'string'?request.query.classId:undefined,negativeOnly:request.query.negativeOnly==='true',lifecycle:typeof request.query.lifecycle === 'string'?request.query.lifecycle:undefined,search:typeof request.query.search === 'string'?request.query.search:undefined,from:typeof request.query.from === 'string'?request.query.from:undefined,to:typeof request.query.to === 'string'?request.query.to:undefined,offset:page(request.query.offset,0,100000),limit:page(request.query.limit,100,200)})));
router.get('/classroom-tasks/summary',handle(request => classroomTaskSummary(typeof request.query.classId === 'string'?request.query.classId:undefined)));
router.post('/classroom-tasks/creation-preview',handle(request => previewTaskCreation(parsed(createTaskSchema,request.body))));
router.post('/classroom-tasks',handle(request => createClassroomTask(parsed(commitTaskSchema,request.body))));
router.get('/classroom-tasks/projects',handle(()=>({projects:listRecordProjects()})));
router.get('/classroom-tasks/projects/operations/:operationId',handle(request=>queryRecordProject(String(request.params.operationId))));
router.post('/classroom-tasks/projects',handle(request=>createRecordProject(parsed(createRecordProjectSchema,request.body))));
router.get('/classroom-tasks/quick-context',handle(request => readQuickContext(parsed(quickContextSchema,request.query))));
router.post('/classroom-tasks/quick-record',handle(request => recordQuick(parsed(quickRecordSchema,request.body))));
router.get('/classroom-tasks/:taskId',handle(request => requireTask(String(request.params.taskId))));
router.get('/classroom-tasks/:taskId/history',handle(request => {
  const detail = requireTask(String(request.params.taskId)); const events = detail.events.filter(event => !request.query.participantId || event.participantId === request.query.participantId).reverse();
  const offset = page(request.query.offset,0,100000); const limit = page(request.query.limit,100,200);
  return {events:events.slice(offset,offset+limit),operations:detail.operations,total:events.length};
}));
router.post('/classroom-tasks/:taskId/operations/preview',handle(request => previewClassroomOperation(String(request.params.taskId),parsed(taskOperationPreviewSchema,request.body))));
router.post('/classroom-tasks/:taskId/operations',handle(request => applyClassroomOperation(String(request.params.taskId),parsed(taskOperationSchema,request.body))));
router.get('/classroom-task-operations/:operationId',handle(request => queryClassroomOperation(String(request.params.operationId))));
router.get('/students/:studentId/classroom-tasks',handle(request => studentClassroomTasks(String(request.params.studentId))));
export default router;
