import { Router } from 'express';
import { requireOwner } from '../middleware/authenticated';
import { DshPromptConfigError, dshPromptAdminState, readDshPromptHistory, saveDshPromptConfig } from '../services/assistant/dshPromptConfig';

const router = Router();
router.use('/admin/assistant/dsh-prompts', requireOwner);
const fail = (error: unknown, response: import('express').Response) => {
  const known = error instanceof DshPromptConfigError;
  response.status(known ? error.status : 503).json({ code: known ? error.code : 'DSH_PROMPT_CONFIG_FAILED', message: known ? error.message : 'DSH 提示词配置暂时无法确认，原内容保留，请重新载入后重试。' });
};
router.get('/admin/assistant/dsh-prompts', async (_request, response) => {
  try { response.json(await dshPromptAdminState()); } catch (error) { fail(error, response); }
});
router.get('/admin/assistant/dsh-prompts/history/:revision', async (request, response) => {
  try { response.json(await readDshPromptHistory(Number(request.params.revision))); } catch (error) { fail(error, response); }
});
router.put('/admin/assistant/dsh-prompts', async (request, response) => {
  try { response.json(await saveDshPromptConfig(request.body, response.locals.authSession.user.id)); } catch (error) { fail(error, response); }
});
export default router;
