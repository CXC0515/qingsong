import { officialAssistantUpgrade, closeOfficialAssistant, officialPrefix } from './services/assistant/officialAssistant';
import { stopAssistant } from './services/assistant/assistantService';
import { modelAdminUpgrade, closeModelAdmin } from './services/assistant/modelAdmin';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import 'dotenv/config';
import { assertProductionAssets, ensureRuntimeDirectories, runtimeConfig } from './config/runtimeConfig';
import { logEvent } from './observability/logger';
import { initializeAuth } from './auth/auth';

ensureRuntimeDirectories();
assertProductionAssets();
await initializeAuth();

const { createApp } = await import('./app');
const { closeRosterDatabase } = await import('./database/rosterDatabase');
const { closeResourceDatabase } = await import('./database/resourceDatabase');
const { closeAuthDatabase } = await import('./database/authDatabase');
const { getAuthDatabase } = await import('./database/authDatabase');
const { createWorkspaceContext, runWithWorkspace } = await import('./context/workspaceContext');
const { resourceRepository } = await import('./repositories/resourceRepository');
const { markProcessingMaterialsInterrupted } = await import('./repositories/materialRepository');
const { markRunningGradingBatchesInterrupted } = await import('./repositories/gradingBatchRepository');

const memberships = getAuthDatabase().prepare(`
  SELECT user_id, workspace_id, role FROM app_workspace_members WHERE status = 'active'
`).all() as Array<{ user_id: string; workspace_id: string; role: 'owner' | 'teacher' }>;
const interrupted = { resourceJobs: 0, materials: 0, gradingBatches: 0 };
for (const membership of memberships) {
  runWithWorkspace(createWorkspaceContext(membership.user_id, membership.workspace_id, membership.role), () => {
    interrupted.resourceJobs += resourceRepository.markRunningJobsInterrupted();
    interrupted.materials += markProcessingMaterialsInterrupted();
    interrupted.gradingBatches += markRunningGradingBatchesInterrupted();
  });
}
if (Object.values(interrupted).some(Boolean)) logEvent('warn', 'running_jobs_marked_interrupted', interrupted);
const app = createApp();
const server = app.listen(runtimeConfig.port, runtimeConfig.host, () => {
  logEvent('info', 'server_started', {
    host: runtimeConfig.host,
    port: runtimeConfig.port,
    nodeEnv: runtimeConfig.nodeEnv,
  });
});

server.on('upgrade',(request,socket,head)=>{void (request.url?.startsWith(officialPrefix + '/') ? officialAssistantUpgrade(request,socket,head) : modelAdminUpgrade(request,socket,head));});

let shuttingDown = false;
const shutdown = (reason: string, exitCode: number) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logEvent('info', 'server_shutdown_started', { reason });
  const forceTimer = setTimeout(() => {
    logEvent('error', 'server_shutdown_forced', { reason, timeoutMs: runtimeConfig.shutdownTimeoutMs });
    server.closeAllConnections();
    process.exit(exitCode || 1);
  }, runtimeConfig.shutdownTimeoutMs);
  forceTimer.unref();
  void Promise.allSettled([stopAssistant(),closeModelAdmin(),closeOfficialAssistant()]);
  server.close(async () => {
    await Promise.allSettled([stopAssistant(),closeModelAdmin(),closeOfficialAssistant()]);
    clearTimeout(forceTimer);
    closeRosterDatabase();
    closeResourceDatabase();
    closeAuthDatabase();
    logEvent('info', 'server_shutdown_completed', { reason });
    process.exit(exitCode);
  });
  server.closeIdleConnections();
};

process.once('SIGINT', () => shutdown('SIGINT', 0));
process.once('SIGTERM', () => shutdown('SIGTERM', 0));
process.once('uncaughtException', (error) => {
  logEvent('error', 'uncaught_exception', { error });
  shutdown('uncaughtException', 1);
});
process.once('unhandledRejection', (error) => {
  logEvent('error', 'unhandled_rejection', { error });
  shutdown('unhandledRejection', 1);
});
