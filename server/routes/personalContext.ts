import {Router} from 'express';
import {ZodError} from 'zod';
import {createPersonalEntry,listPersonalEntries,personalHistory,updatePersonalEntry,PersonalContextError} from '../services/assistant/personalContext';
const router = Router();
router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
router.get('/assistant/personal-context',(_req,res)=>res.json({entries:listPersonalEntries()}));
router.get('/assistant/personal-context/:id/history',(req,res,next)=>{try{res.json({entries:personalHistory(String(req.params.id))});}catch(e){next(e);}});
router.post('/assistant/personal-context',(req,res,next)=>{try{res.json({entry:createPersonalEntry(req.body)});}catch(e){next(e);}});
router.patch('/assistant/personal-context/:id',(req,res,next)=>{try{res.json({entry:updatePersonalEntry(String(req.params.id),req.body)});}catch(e){next(e);}});
router.use((error:unknown,_req:import('express').Request,res:import('express').Response,next:import('express').NextFunction)=>{
  if(error instanceof ZodError){res.status(400).json({code:'INVALID_PERSONAL_CONTEXT',message:'内容格式不正确，个人记录未保存。每条最多600字，请检查后重试。',saved:false});return;}
  if(error instanceof PersonalContextError){res.status(error.status).json({code:error.code,message:error.message,saved:false});return;}
  next(error);
});
export default router;
