import { getWorkspaceContext } from '../context/workspaceContext';
import { Router } from 'express';
import { behaviorFilterSchema, behaviorSchema, behaviorRoundContextSchema, behaviorNewRoundSchema } from '../schemas/classroomBehavior';
import { listBehavior, queryBehaviorOperation, recordBehavior, behaviorRounds, newBehaviorRound } from '../services/classroom/classroomBehaviorService';
import { ClassroomTaskError } from '../services/classroom/classroomTaskService';
const router=Router();
router.use((_req,res,next)=>{try{getWorkspaceContext();next();}catch{res.status(401).json({message:'登录已失效，请重新登录。'});}});
router.get('/classroom-behavior', (req,res,next)=>{const parsed=behaviorFilterSchema.safeParse(req.query);if(!parsed.success){res.status(400).json({message:'查询范围不正确，请重新选择日期。'});return;}try{res.json(listBehavior(parsed.data));}catch(e){next(e);}});
router.get('/classroom-behavior/rounds',(req,res,next)=>{const parsed=behaviorRoundContextSchema.safeParse(req.query);if(!parsed.success){res.status(400).json({message:'轮次范围不正确，请重新选择班级、项目和日期。'});return;}try{res.json(behaviorRounds(parsed.data));}catch(e){next(e);}});
router.post('/classroom-behavior/rounds',(req,res,next)=>{const parsed=behaviorNewRoundSchema.safeParse(req.body);if(!parsed.success){res.status(400).json({message:'轮次格式不正确，本次未新建，请重新读取。',saved:false});return;}try{res.json(newBehaviorRound(parsed.data));}catch(e){next(e);}});
router.get('/classroom-behavior/operations/:id',(req,res,next)=>{try{res.json(queryBehaviorOperation(String(req.params.id)));}catch(e){next(e);}});
router.post('/classroom-behavior',(req,res,next)=>{const parsed=behaviorSchema.safeParse(req.body);if(!parsed.success){res.status(400).json({message:'记录格式不正确，本次未保存，请检查日期和内容。',saved:false});return;}try{res.json(recordBehavior(parsed.data));}catch(e){next(e);}});
router.use((error:unknown,_req:import('express').Request,res:import('express').Response,_next:import('express').NextFunction)=>{
  if(error instanceof ClassroomTaskError){res.status(error.status).json({code:error.code,message:error.message,saved:false});return;}
  console.error('[classroom-behavior]',error instanceof Error?error.name:'UnknownError');res.status(500).json({message:'尚未确认这笔表现是否保存，请核对后重试。',saved:'unknown'});
});
export default router;
