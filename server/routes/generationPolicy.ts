import {Router} from 'express';
import {requireOwner} from '../middleware/authenticated';
import {GenerationPolicyError,generationAdminState,saveGenerationPolicy} from '../services/assistant/generationPolicy';
const router=Router();
router.use('/admin/assistant/generation',requireOwner);
const failure=(error:unknown,response:any)=>response.status(error instanceof GenerationPolicyError?error.status:503).json({code:error instanceof GenerationPolicyError?error.code:'GENERATION_SETTINGS_FAILED',message:error instanceof GenerationPolicyError?error.message:'生成设置暂时无法确认，原配置保留，请重新载入核对后重试。'});
router.get('/admin/assistant/generation',async(_request,response)=>{try{response.json(await generationAdminState());}catch(error){failure(error,response);}});
router.put('/admin/assistant/generation',async(request,response)=>{try{response.json(await saveGenerationPolicy(request.body,response.locals.authSession.user.id));}catch(error){failure(error,response);}});
export default router;
