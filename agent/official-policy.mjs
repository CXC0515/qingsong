// Fixed to DSH 0.2.1-rc.3. Only teaching chat, model selection and feedback are exposed.
const unary = new Set([
  'session/create', 'session/fork', 'session/list', 'session/page', 'session/projections',
  'session/search', 'session/prompt', 'session/cancel', 'session/rename', 'session/selectModel',
  'session/attachment', 'session/modelCatalog', 'session/initializeDefaultModel', 'session/canOpenWorkspacePath',
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
  if (endpoint === 'session/prompt' && (!validOfficialContent(request?.content) || !['queue', 'steer'].includes(request.mode))) return false;
  if (endpoint === 'session/updateQueue' && (!request?.action || !['edit', 'remove', 'steer'].includes(request.action.kind) || (request.action.kind === 'edit' && !validOfficialContent(request.action.content)))) return false;
  return true;
}

// Files use native session-owned upload receipts. Paths and durable references are never client input.
export function validOfficialContent(content) {
  if (!Array.isArray(content) || !content.length || content.length > 20) return false;
  let textLength = 0, imageBytes = 0, images = 0, attachments = 0, useful = false;
  for (const part of content) {
    if (!part || typeof part !== 'object' || Array.isArray(part)) return false;
    if (part.type === 'text') {
      if (Object.keys(part).some(key => !['type','text'].includes(key)) || typeof part.text !== 'string') return false;
      textLength += part.text.length; useful ||= Boolean(part.text.trim());
    } else if (part.type === 'image') {
      if (Object.keys(part).some(key => !['type','mediaType','data','name'].includes(key)) || !['image/png','image/jpeg','image/webp','image/gif'].includes(part.mediaType) || typeof part.data !== 'string' || !part.data.length || part.data.length > 13981016 || (part.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(part.data)) || (part.name !== undefined && (typeof part.name !== 'string' || part.name.length > 255))) return false;
      const bytes = part.data.length * 3 / 4 - (part.data.endsWith('==') ? 2 : part.data.endsWith('=') ? 1 : 0);
      if (bytes > 10 * 1024 * 1024) return false;
      imageBytes += bytes; images++; attachments++; useful = true;
    } else if (part.type === 'file') {
      if (Object.keys(part).some(key => !['type','receiptId'].includes(key)) || typeof part.receiptId !== 'string' || !part.receiptId.length || part.receiptId.length > 200) return false;
      attachments++; useful = true;
    } else return false;
  }
  return useful && textLength <= 8000 && images <= 5 && attachments <= 20 && imageBytes <= 20 * 1024 * 1024;
}
