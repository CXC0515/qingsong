// Fixed to DSH 0.2.1-rc.3. Only teaching chat, model selection and feedback are exposed.
const unary = new Set([
  'session/create', 'session/fork', 'session/list', 'session/page', 'session/projections',
  'session/search', 'session/prompt', 'session/cancel', 'session/rename', 'session/selectModel',
  'session/modelCatalog', 'session/initializeDefaultModel', 'session/canOpenWorkspacePath',
  'session/updateQueue', 'workspace/initializeDefault', 'workspace/archiveSession',
  'workspace/unarchiveSession', 'workspace/pinSession', 'workspace/unpinSession',
  'workspace/insertSessionBefore', 'messageFeedback/put', 'messageFeedback/list',
  'messageFeedback/delete', 'sessionFeedback/record', 'agentPresets/list', 'permissionPresets/catalog', 'commands/list', 'skills/list', '$events/result',
]);
const streams = new Set(['session/control', 'session/follow', 'workspace/follow', 'remoteAccess/follow', 'job/list', '$events']);
export function allowOfficialCall(endpoint, payload, stream = false) {
  if (!(stream ? streams : unary).has(endpoint)) return false;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !payload.args || typeof payload.args !== 'object') return false;
  const request = payload.args.request;
  if (endpoint === 'session/create') {
    if (!request || Object.keys(request).some(key => !['workspaceId', 'sessionId', 'agentPreset'].includes(key))) return false;
    if (request.agentPreset && request.agentPreset !== 'qingsong') return false;
  }
  const validText = content => Array.isArray(content) && content.length > 0 && content.length <= 20 && content.every(part => part && part.type === 'text' && typeof part.text === 'string') && content.reduce((n, part) => n + part.text.length, 0) <= 8000 && content.some(part => part.text.trim());
  if (endpoint === 'session/prompt' && (!validText(request?.content) || !['queue', 'steer'].includes(request.mode))) return false;
  if (endpoint === 'session/updateQueue' && (!request?.action || !['edit', 'remove', 'steer'].includes(request.action.kind) || (request.action.kind === 'edit' && !validText(request.action.content)))) return false;
  return true;
}
