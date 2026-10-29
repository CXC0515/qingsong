import { officialAssistantProxy } from './services/assistant/officialAssistant';
import classroomBehaviorRouter from './routes/classroomBehavior';
import personalContextRouter from './routes/personalContext';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';
import { accessSync, constants } from 'node:fs';
import path from 'node:path';
import express, { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './auth/auth';
import { getModelConfig, isModelConfigured } from './config/modelConfig';
import { getDocumentParserConfig, isPaddleCloudConfigured } from './config/documentParserConfig';
import { RuntimeConfig, runtimeConfig } from './config/runtimeConfig';
import { getAuthDatabase } from './database/authDatabase';
import { getRosterDatabase } from './database/rosterDatabase';
import { getResourceDatabase } from './database/resourceDatabase';
import { createWorkspaceContext, runWithWorkspace, WorkspaceRole } from './context/workspaceContext';
import { logEvent } from './observability/logger';
import gradingTasksRouter from './routes/gradingTasks';
import rosterRouter from './routes/roster';
import classroomRouter from './routes/classroom';
import classroomTasksRouter from './routes/classroomTasks';
import gradingTaskManagementRouter from './routes/gradingTaskManagement';
import resourcesRouter from './routes/resources';
import materialPoolRouter from './routes/materialPool';
import scheduleRouter from './routes/schedule';
import registrationRouter from './routes/registration';
import accountRouter from './routes/account';
import assistantRouter from './routes/assistant';
import generationPolicyRouter from './routes/generationPolicy';
import { modelAdminProxy } from './services/assistant/modelAdmin';
import { requireOwner, requireAuthenticatedWorkspace } from './middleware/authenticated';
import { requireSameOriginMutation, requireNativeSameOriginMutation } from './middleware/csrf';
import { securityHeaders } from './middleware/security';

const readiness = (config: RuntimeConfig) => {
  accessSync(config.systemDirectory, constants.R_OK | constants.W_OK);
  accessSync(config.workspacesDirectory, constants.R_OK | constants.W_OK);
  getAuthDatabase().prepare('SELECT 1').get();
  const memberships = getAuthDatabase().prepare(`
    SELECT user_id, workspace_id, role FROM app_workspace_members WHERE status = 'active'
  `).all() as Array<{ user_id: string; workspace_id: string; role: WorkspaceRole }>;
  for (const membership of memberships) {
    runWithWorkspace(createWorkspaceContext(membership.user_id, membership.workspace_id, membership.role), () => {
      getRosterDatabase().prepare('SELECT 1').get();
      getResourceDatabase().prepare('SELECT 1').get();
    });
  }
  return {
    ok: true,
    storage: 'ready',
    multimodalConfigured: isModelConfigured(getModelConfig()),
    paddleCloudConfigured: isPaddleCloudConfigured(getDocumentParserConfig()),
  };
};

export const createApp = (config: RuntimeConfig = runtimeConfig) => {
  const app = express();
  app.disable('x-powered-by');
  if (config.production) app.set('trust proxy', 1);
  app.use(securityHeaders);

  app.use((request, response, next) => {
    const requestId = request.header('x-request-id')?.slice(0, 128) || randomUUID();
    response.setHeader('x-request-id', requestId);
    const startedAt = performance.now();
    response.on('finish', () => {
      logEvent('info', 'http_request_completed', {
        requestId,
        method: request.method,
        route: typeof request.route?.path === 'string' ? request.route.path : 'unmatched',
        statusCode: response.statusCode,
        durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
      });
    });
    next();
  });

  app.get('/api/health/live', (_request, response) => response.json({ ok: true }));
  app.get('/api/health/ready', (_request, response) => {
    try {
      response.json(readiness(config));
    } catch (error) {
      logEvent('error', 'readiness_check_failed', { error });
      response.status(503).json({ ok: false, code: 'SERVICE_NOT_READY' });
    }
  });
  app.get('/api/health', (_request, response) => {
    try {
      response.json(readiness(config));
    } catch (error) {
      logEvent('error', 'health_check_failed', { error });
      response.status(503).json({ ok: false, code: 'SERVICE_NOT_READY' });
    }
  });

  // Public sign-up is intentionally unavailable. Accounts can only be created
  // through a one-time application invitation at /api/register.
  app.use('/api/auth', (request, response, next) => {
    const normalizedPath = request.path.replace(/\/+$/, '');
    if (normalizedPath === '/sign-up/email') return response.status(404).json({ code: 'API_NOT_FOUND' });
    next();
  });
  app.all('/api/auth/*splat', toNodeHandler(auth));

  // Only image-bearing native prompt RPCs need a larger encoded body. Keep all
  // other API payloads at the existing bound; raw uploads remain streaming.
  const ordinaryJson = express.json({ limit: '1mb' });
  const attachmentJson = express.json({ limit: '30mb' });
  app.use((request, response, next) => {
    const endpoint = request.path;
    if (endpoint === '/api/assistant/official/api/session/prompt' || endpoint === '/api/assistant/official/api/session/updateQueue') {
      return requireAuthenticatedWorkspace(request, response, () => requireNativeSameOriginMutation(request, response, () => attachmentJson(request, response, next)));
    }
    return ordinaryJson(request, response, next);
  });
  app.use('/api', (request,response,next) => request.path.replace(/\/+$/, '') === '/register' ? requireSameOriginMutation(request,response,next) : next(), registrationRouter);
  app.use('/api', requireAuthenticatedWorkspace);
  app.use('/api/assistant/manage', requireOwner, modelAdminProxy);
  app.use('/api/assistant/official', officialAssistantProxy);
  app.use('/api', requireSameOriginMutation);
  app.use('/api', generationPolicyRouter);
  app.use('/api', assistantRouter);
  app.use('/api', personalContextRouter);
  app.use('/api', accountRouter);

  app.use('/api', rosterRouter);
  app.use('/api', classroomRouter);
  app.use('/api', classroomTasksRouter);
  app.use('/api', classroomBehaviorRouter);
  app.use('/api', gradingTaskManagementRouter);
  app.use('/api/grading-tasks', gradingTasksRouter);
  app.use('/api', resourcesRouter);
  app.use('/api', materialPoolRouter);
  app.use('/api', scheduleRouter);
  app.use('/api', (_request, response) => response.status(404).json({ code: 'API_NOT_FOUND' }));

  if (config.production) {
    app.use('/assets', express.static(path.join(config.distDirectory, 'assets'), {
      index: false,
      immutable: true,
      maxAge: '1y',
    }));
    app.use('/assets', (_request, response) => {
      response.setHeader('Cache-Control', 'no-store');
      response.status(404).json({ code: 'STATIC_ASSET_NOT_FOUND' });
    });
    app.use(express.static(config.distDirectory, {
      index: false,
      maxAge: 0,
      setHeaders: (response, filePath) => {
        if (path.basename(filePath) === 'index.html') response.setHeader('Cache-Control', 'no-store');
      },
    }));
    app.get(/.*/, (request, response, next) => {
      if (request.path.startsWith('/api/')) return next();
      response.setHeader('Cache-Control', 'no-store');
      response.sendFile('index.html', { root: config.distDirectory });
    });
  }

  app.use((_request, response) => response.status(404).json({ code: 'NOT_FOUND' }));
  app.use((error: unknown, request: Request, response: Response, _next: NextFunction) => {
    const requestId = String(response.getHeader('x-request-id') ?? 'unknown');
    logEvent('error', 'unhandled_request_error', { requestId, error });
    if (response.headersSent) return;
    if (error instanceof multer.MulterError) {
      const status = error.code === 'LIMIT_FILE_SIZE' || error.code === 'LIMIT_FILE_COUNT' ? 413 : 400;
      return response.status(status).json({ code: error.code });
    }
    if (typeof error === 'object' && error && 'status' in error && error.status === 413) {
      return response.status(413).json({ code: 'REQUEST_TOO_LARGE' });
    }
    response.status(500).json({ code: 'INTERNAL_SERVER_ERROR', requestId });
  });

  return app;
};
