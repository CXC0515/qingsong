/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from 'express';
import { z } from 'zod';
import { createInvitation } from '../auth/invitations';
import { capturePasswordResetUrl } from '../auth/passwordResetCapture';
import { auth } from '../auth/auth';
import { runtimeConfig } from '../config/runtimeConfig';
import { getAuthDatabase } from '../database/authDatabase';
import { requireOwner } from '../middleware/authenticated';
import { getWorkbenchShortcuts, saveWorkbenchShortcuts } from '../repositories/scheduleRepository';
import { workbenchShortcutDestinations } from '../../src/domain/userPreferences';

const router = Router();
const profileSchema = z.object({
  nickname: z.string().trim().min(1).max(40),
  realName: z.string().trim().max(40),
  schoolName: z.string().trim().max(100),
  title: z.string().trim().max(60),
});
const invitationSchema = z.object({
  email: z.email().max(320),
  displayName: z.string().trim().min(1).max(80),
});

router.get('/account', (_request, response) => {
  const user = response.locals.authSession.user;
  const row = getAuthDatabase().prepare('SELECT profile_json FROM app_teacher_profiles WHERE user_id = ?').get(user.id) as { profile_json: string } | undefined;
  response.json({
    user: { id: user.id, email: user.email, name: user.name },
    role: response.locals.workspace.role,
    profile: row ? JSON.parse(row.profile_json) : { nickname: user.name, realName: user.name, schoolName: '', title: '' },
  });
});

router.put('/account/profile', (request, response) => {
  const parsed = profileSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ code: 'INVALID_TEACHER_PROFILE' });
  const now = new Date().toISOString();
  getAuthDatabase().prepare(`
    INSERT INTO app_teacher_profiles (user_id, profile_json, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET profile_json = excluded.profile_json, updated_at = excluded.updated_at
  `).run(response.locals.authSession.user.id, JSON.stringify(parsed.data), now);
  return response.json({ profile: parsed.data });
});

router.get('/account/workbench-shortcuts',(_request,response)=>response.json(getWorkbenchShortcuts(response.locals.authSession.user.id)));
router.put('/account/workbench-shortcuts',(request,response)=>{
  const parsed=z.object({destinations:z.array(z.enum(workbenchShortcutDestinations)).length(4),version:z.number().int().min(0)}).strict().safeParse(request.body);
  if(!parsed.success||new Set(parsed.data?.destinations??[]).size!==4)return response.status(400).json({code:'INVALID_WORKBENCH_SHORTCUTS'});
  try{return response.json(saveWorkbenchShortcuts(response.locals.authSession.user.id,parsed.data.destinations,parsed.data.version));}
  catch(error){if(error instanceof Error&&error.message==='WORKBENCH_SHORTCUTS_CONFLICT')return response.status(409).json({code:'WORKBENCH_SHORTCUTS_CONFLICT'});throw error;}
});

router.get('/admin/accounts', requireOwner, (_request, response) => {
  const accounts = getAuthDatabase().prepare(`
    SELECT u.id, u.email, u.name, u.createdAt AS created_at, m.role, m.status
    FROM user u JOIN app_workspace_members m ON m.user_id = u.id
    ORDER BY u.createdAt DESC
  `).all();
  const invitations = getAuthDatabase().prepare(`
    SELECT id, email, display_name AS displayName, role, status, expires_at AS expiresAt, created_at AS createdAt
    FROM app_invitations ORDER BY created_at DESC LIMIT 100
  `).all();
  response.json({ accounts, invitations });
});

router.post('/admin/invitations', requireOwner, (request, response) => {
  const parsed = invitationSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ code: 'INVALID_INVITATION' });
  try {
    const invitation = createInvitation({
      ...parsed.data,
      createdByUserId: response.locals.authSession.user.id,
    });
    const url = new URL('/register', runtimeConfig.appUrl);
    url.searchParams.set('token', invitation.token);
    url.searchParams.set('email', parsed.data.email.trim().toLowerCase());
    response.status(201).json({ invitation: { ...invitation, url: url.toString() } });
  } catch {
    response.status(409).json({ code: 'INVITATION_CONFLICT' });
  }
});

router.post('/admin/invitations/:invitationId/revoke', requireOwner, (request, response) => {
  const result = getAuthDatabase().prepare(`
    UPDATE app_invitations SET status = 'revoked' WHERE id = ? AND status = 'pending'
  `).run(request.params.invitationId);
  if (!result.changes) return response.status(404).json({ code: 'PENDING_INVITATION_NOT_FOUND' });
  response.status(204).end();
});

router.post('/admin/accounts/:userId/password-reset', requireOwner, async (request, response) => {
  const user = getAuthDatabase().prepare(`
    SELECT u.email FROM user u JOIN app_workspace_members m ON m.user_id = u.id WHERE u.id = ? AND m.status = 'active'
  `).get(request.params.userId) as { email: string } | undefined;
  if (!user) return response.status(404).json({ code: 'ACCOUNT_NOT_FOUND' });
  let resetUrl: string | undefined;
  try {
    resetUrl = await capturePasswordResetUrl(async () => {
      await auth.api.requestPasswordReset({ body: { email: user.email, redirectTo: `${runtimeConfig.appUrl}/reset-password` } });
    });
  } catch {
    return response.status(500).json({ code: 'PASSWORD_RESET_LINK_FAILED' });
  }
  if (!resetUrl) return response.status(500).json({ code: 'PASSWORD_RESET_LINK_FAILED' });
  response.json({ resetUrl, expiresInMinutes: 30 });
});

export default router;
