import { createHash } from 'node:crypto';
import { z } from 'zod';
import { preparationRepository as repo } from '../../repositories/preparationRepository';
import * as preparations from '../preparation/preparationService';
import type { PreparationAssistantContext } from '../../../src/domain/preparationAssistant';

export interface PreparationReference {
  id: string; preparationId: string; documentId: string; revision: number; title: string;
  selection?: PreparationAssistantContext['selection'];
}
const referenceKey = (id: string) => 'preparation-reference:' + z.uuid().parse(id);
const sessionKey = (id: string) => 'preparation-references:' + z.string().regex(/^[a-zA-Z0-9_-]{1,160}$/).parse(id);
export function listPreparationReferenceCandidates(query = '') {
  const needle = query.trim().toLocaleLowerCase();
  return preparations.listPreparations().flatMap(preparation =>
    preparations.getPreparation(preparation.id).documents.map(document => ({
      preparationId: preparation.id, documentId: document.id, revision: document.revision,
      title: preparation.title === document.title ? document.title : preparation.title + ' · ' + document.title,
    })),
  ).filter(item => !needle || item.title.toLocaleLowerCase().includes(needle)).slice(0, 50);
}
export function preparationReferenceStatus(id: string) {
  const reference = getPreparationReference(id);
  const latest = preparations.getDocument(reference.preparationId, reference.documentId);
  return {...reference, latestRevision: latest.revision, stale: latest.revision !== reference.revision};
}
export function previewPreparationReference(id: string) {
  const reference = preparationReferenceStatus(id);
  const document = preparations.getDocument(reference.preparationId, reference.documentId, reference.revision);
  return {reference, content: document.content, url: '/?page=lesson-plan&preparationId='+reference.preparationId+'&documentId='+reference.documentId};
}
export function updatePreparationReference(id: string) {
  const reference = preparationReferenceStatus(id);
  if (reference.selection && reference.stale)
    throw new preparations.PreparationError('SELECTION_CHANGED', '选区所在正文已有新版，请回到教案重新选择；当前输入和旧引用保留。', 409);
  return createPreparationReference({preparationId: reference.preparationId, documentId: reference.documentId, selection: reference.selection});
}
export function createPreparationReference(input: PreparationAssistantContext): PreparationReference {
  const detail = preparations.getPreparation(input.preparationId!);
  const document = preparations.getDocument(detail.preparation.id, input.documentId ?? detail.documents[0].id, input.revision);
  // The same document version and selection have one stable reference identity.
  const hash = createHash('sha256').update(JSON.stringify([detail.preparation.id, document.id, document.revision, input.selection ?? null])).digest('hex');
  const id = `${hash.slice(0,8)}-${hash.slice(8,12)}-5${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
  const reference: PreparationReference = { id, preparationId: detail.preparation.id, documentId: document.id, revision: document.revision, title: detail.preparation.title === document.title ? document.title : detail.preparation.title + ' · ' + document.title, ...(input.selection ? {selection: input.selection} : {}) };
  repo.setSetting(referenceKey(reference.id), reference);
  return reference;
}
export function getPreparationReference(id: string): PreparationReference {
  const reference = repo.setting<PreparationReference>(referenceKey(id));
  if (!reference) throw new preparations.PreparationError('REFERENCE_NOT_FOUND', '教案引用不可用，原稿和会话保留。请从教案重新添加引用。', 404);
  preparations.getDocument(reference.preparationId, reference.documentId, reference.revision);
  return reference;
}
/** Only the trusted native pre-step registers references actually present in human messages. */
export function registerPreparationReferences(sessionId: string, referenceIds: unknown, currentIds: unknown) {
  const schema = z.array(z.uuid()).max(100);
  const ids = [...new Set(schema.parse(referenceIds))], current = [...new Set(schema.parse(currentIds))];
  if (current.some(id => !ids.includes(id))) throw new preparations.PreparationError('REFERENCE_NOT_SENT', '教案引用未随消息发送，未开始修改。请重新添加引用。');
  current.forEach(getPreparationReference);
  const previous=repo.setting<{ids:string[]}>(sessionKey(sessionId))?.ids??[];
  const available=ids.filter(id=>{try{getPreparationReference(id);return true;}catch(error){if(error instanceof preparations.PreparationError&&error.status===404)return false;throw error;}});
  const recent = [...new Set([...available.filter(id => !current.includes(id)), ...current])];
  const retained = [...previous.filter(id => !recent.includes(id)), ...recent].slice(-100);
  repo.setSetting(sessionKey(sessionId), {ids: retained, current});
  return sessionPreparationReferences(sessionId);
}
export function sessionPreparationReferences(sessionId: string): PreparationReference[] {
  const state = repo.setting<{ids: string[]; current: string[]}>(sessionKey(sessionId));
  if (!state) return [];
  return state.ids.flatMap(id => {
    try { return [getPreparationReference(id)]; } catch (error) {
      if (error instanceof preparations.PreparationError && error.status === 404) return [];
      throw error;
    }
  });
}
export function currentPreparationReferences(sessionId: string): PreparationReference[] {
  const current = new Set(repo.setting<{current: string[]}>(sessionKey(sessionId))?.current ?? []);
  return sessionPreparationReferences(sessionId).filter(reference => current.has(reference.id));
}
export function resolveTaskReference(sessionId: string, referenceId?: string): PreparationReference {
  const references = sessionPreparationReferences(sessionId);
  const current = repo.setting<{current: string[]}>(sessionKey(sessionId))?.current ?? [];
  const named = referenceId ? references.filter(ref => ref.id === referenceId) : [];
  const candidates = referenceId ? named : current.length ? references.filter(ref => current.includes(ref.id)) : references;
  const documents = new Map<string, PreparationReference[]>();
  for (const reference of candidates) {
    const key = reference.preparationId + ':' + reference.documentId;
    documents.set(key, [...(documents.get(key) ?? []), reference]);
  }
  if (documents.size !== 1)
    throw new preparations.PreparationError('PREPARATION_TARGET_REQUIRED', '请明确本次要修改的教案引用，已有内容保留；多份教案不能自动猜选。');
  const refs = [...documents.values()][0];
  const reference = [...refs].sort((a,b)=>b.revision-a.revision)[0];
  const latest = preparations.getDocument(reference.preparationId, reference.documentId);
  const selected = refs.filter(item=>item.selection);
  if (selected.length > 1) throw new preparations.PreparationError('PREPARATION_SELECTION_REQUIRED', '有多个不同选区，请明确本次选区；原文和引用保留，尚未开始修改。');
  const selection = selected.length === 1 ? selected[0].selection : undefined;
  return {...reference, revision:latest.revision, ...(selection ? {selection} : {selection:undefined})};
}
