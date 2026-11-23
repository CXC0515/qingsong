/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  DiscoverySuggestion,
  KnowledgeEntity,
  KnowledgeFocusSnapshot,
  KnowledgeGraphSnapshot,
  KnowledgeSubject,
  KnowledgeTag,
  KnowledgeRelation,
  KnowledgeRelationType,
  LibraryResource,
  ResourceDetail,
  ResourcePageState,
  ResourceKind,
  ResourceChunk,
} from "../domain/types";
import { apiFetch } from './apiClient';
import { RESOURCE_UPLOAD_LIMIT_BYTES } from '../domain/uploadPolicy';

export class ResourceApiError extends Error {
  constructor(public readonly code: string, public readonly status?: number) {
    super(code);
    this.name = 'ResourceApiError';
  }
}

const resourceErrorMessages: Record<string, string> = {
  LIMIT_FILE_SIZE: '文件超过 80 MB 上限，请压缩或拆分 PDF 后重试',
  LIMIT_FILE_COUNT: '每次只能上传一个 PDF 文件',
  REQUEST_TOO_LARGE: '文件超过 80 MB 上限，请压缩或拆分 PDF 后重试',
  RESOURCE_FILE_TOO_LARGE: '文件超过 80 MB 上限，请压缩或拆分 PDF 后重试',
  INVALID_PDF: '无法读取这个 PDF，文件可能已损坏或加密，请检查后重试',
  UNAUTHORIZED: '登录已失效，请重新登录后继续',
  FORBIDDEN: '当前账号没有操作这份资料的权限',
  RATE_LIMITED: '操作过于频繁，请稍后再试',
};

export const getResourceErrorMessage = (error: unknown) => {
  const code = error instanceof Error ? error.message : '';
  const status = error instanceof ResourceApiError ? error.status : undefined;
  if (resourceErrorMessages[code]) return resourceErrorMessages[code];
  if (status === 413 || code === 'HTTP_413') return resourceErrorMessages.REQUEST_TOO_LARGE;
  if (status === 401 || code === 'HTTP_401') return resourceErrorMessages.UNAUTHORIZED;
  if (status === 403 || code === 'HTTP_403') return resourceErrorMessages.FORBIDDEN;
  if (status === 429 || code === 'HTTP_429') return resourceErrorMessages.RATE_LIMITED;
  if ([502, 503, 504].includes(status ?? 0) || /^HTTP_50[234]$/.test(code)) {
    return '服务器或识别服务暂时不可用，本次内容没有保存，请稍后重试';
  }
  return '保存失败，请检查网络后重试；如果仍然失败，请联系管理员';
};

const readErrorCode = async (response: Response) => {
  const body = (await response.json().catch(() => ({}))) as { code?: string };
  return body.code ?? `HTTP_${response.status}`;
};

const requestJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await apiFetch(url, init);
  if (!response.ok) throw new ResourceApiError(await readErrorCode(response), response.status);
  return response.json() as Promise<T>;
};

export interface ResourceMetadataInput {
  title: string;
  kind: ResourceKind;
  subject: string;
  grade: string;
  publisher: string;
  edition: string;
  isPrimary: boolean;
}

export const listLibraryResources = async () =>
  (await requestJson<{ resources: LibraryResource[] }>("/api/resources"))
    .resources;

export const getLibraryResource = async (resourceId: string) =>
  (
    await requestJson<{ resource: ResourceDetail }>(
      `/api/resources/${resourceId}`,
    )
  ).resource;

export const uploadLibraryResource = async (
  file: File,
  metadata: ResourceMetadataInput,
) => {
  if (file.size > RESOURCE_UPLOAD_LIMIT_BYTES) {
    throw new ResourceApiError('RESOURCE_FILE_TOO_LARGE', 413);
  }
  const form = new FormData();
  form.set("file", file);
  Object.entries(metadata).forEach(([key, value]) =>
    form.set(key, String(value)),
  );
  return (
    await requestJson<{ resource: LibraryResource }>("/api/resources", {
      method: "POST",
      body: form,
    })
  ).resource;
};

export const usePoolPdfAsResource = async (poolItemId: string, metadata: ResourceMetadataInput) =>
  (await requestJson<{ resource: LibraryResource; reused: boolean }>('/api/resources/from-pool', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ poolItemId, ...metadata }),
  }));

export const updateLibraryResource = async (
  resourceId: string,
  metadata: Partial<ResourceMetadataInput>,
) =>
  (
    await requestJson<{ resource: LibraryResource }>(
      `/api/resources/${resourceId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(metadata),
      },
    )
  ).resource;

export const deleteLibraryResource = async (resourceId: string) => {
  const response = await apiFetch(`/api/resources/${resourceId}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error(await readErrorCode(response));
};

export const analyzeLibraryResource = async (
  resourceId: string,
  pageStart: number,
  pageEnd: number,
) =>
  (
    await requestJson<{ resource: LibraryResource }>(
      `/api/resources/${resourceId}/analyze`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageStart, pageEnd }),
      },
    )
  ).resource;

export const setLibraryResourcePageIncluded = async (
  resourceId: string,
  pageNumber: number,
  included: boolean,
) => (
  await requestJson<{ page: ResourcePageState }>(
    `/api/resources/${resourceId}/pages/${pageNumber}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ included }),
    },
  )
).page;

export const retrieveLibraryResource = async (resourceId: string, query: string) => (
  await requestJson<{ results: Array<ResourceChunk & { retrievalRank: number }> }>(
    `/api/resources/${resourceId}/retrieve?q=${encodeURIComponent(query)}`,
  )
).results;

export const getKnowledgeGraph = async (query = "") => {
  const suffix = query ? `?q=${encodeURIComponent(query)}` : "";
  return requestJson<KnowledgeGraphSnapshot>(`/api/knowledge${suffix}`);
};

export type KnowledgeNodeInput = Pick<
  KnowledgeEntity,
  "name" | "type" | "description" | "aliases" | "subject" | "grade" | "stageIds" | "tags"
> & Partial<Pick<KnowledgeEntity, "trainable" | "sortOrder">> & {
  primaryMotherId?: string | null;
};
export const createKnowledgeNode = async (input: KnowledgeNodeInput) =>
  (
    await requestJson<{ node: KnowledgeEntity }>("/api/knowledge/nodes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
  ).node;

export const updateKnowledgeNode = async (
  nodeId: string,
  input: Partial<KnowledgeNodeInput>,
) =>
  (
    await requestJson<{ node: KnowledgeEntity }>(
      `/api/knowledge/nodes/${nodeId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
    )
  ).node;

export const getKnowledgeFocus = async (nodeId: string) =>
  requestJson<KnowledgeFocusSnapshot>(
    `/api/knowledge/nodes/${nodeId}/focus`,
  );

export const createKnowledgeSubject = async (input: { name: string; code: string }) =>
  (await requestJson<{ subject: KnowledgeSubject }>("/api/knowledge/subjects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })).subject;

export const updateKnowledgeSubject = async (
  subjectId: string,
  input: { name?: string; status?: "active" | "inactive" },
) => (await requestJson<{ subject: KnowledgeSubject }>(`/api/knowledge/subjects/${subjectId}`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(input),
})).subject;

export const createKnowledgeTag = async (name: string) =>
  (await requestJson<{ tag: KnowledgeTag }>("/api/knowledge/tags", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  })).tag;

export const archiveKnowledgeNode = async (nodeId: string) => {
  const response = await apiFetch(`/api/knowledge/nodes/${nodeId}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error(await readErrorCode(response));
};

export const mergeKnowledgeNode = async (
  nodeId: string,
  targetNodeId: string,
) =>
  (
    await requestJson<{ node: KnowledgeEntity }>(
      `/api/knowledge/nodes/${nodeId}/merge`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetNodeId }),
      },
    )
  ).node;

export const createKnowledgeRelation = async (input: {
  sourceNodeId: string;
  targetNodeId: string;
  type: KnowledgeRelationType;
  description: string;
}) =>
  (
    await requestJson<{ relation: KnowledgeRelation }>(
      "/api/knowledge/relations",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
    )
  ).relation;

export const reviewSuggestion = async (
  suggestionId: string,
  decision: "accepted" | "ignored" | "merged",
  options?: { mergeTargetId?: string; primaryMotherId?: string | null },
) =>
  (
    await requestJson<{ suggestion: DiscoverySuggestion }>(
      `/api/knowledge/suggestions/${suggestionId}/review`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, ...options }),
      },
    )
  ).suggestion;

export const batchReviewSuggestions = async (
  suggestionIds: string[],
  decision: "accepted" | "ignored",
) =>
  (
    await requestJson<{ suggestions: DiscoverySuggestion[] }>(
      "/api/knowledge/suggestions/batch-review",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestionIds, decision }),
      },
    )
  ).suggestions;
