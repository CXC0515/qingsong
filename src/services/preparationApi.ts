import { apiFetch } from "./apiClient";
import type {
  DocumentRecord,
  DocumentRevision,
  RichDocument,
} from "../domain/document";
import type {
  Preparation,
  PreparationDetail,
  PreparationSource,
  PreparationSessionBinding,
} from "../domain/preparation";

export class PreparationApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await apiFetch(url, init);
  } catch {
    throw new PreparationApiError(
      "网络连接失败，服务器保存结果尚未确认。请保留当前内容并重试。",
      0,
    );
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new PreparationApiError(
      data.message || "操作未完成，已有内容保留，请重试。",
      response.status,
      data.code,
    );
  return data as T;
}
const base = "/api/preparations";
const json = (method: string, data: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data),
});
const docPath = (id: string, documentId: string) =>
  `${base}/${encodeURIComponent(id)}/documents/${encodeURIComponent(documentId)}`;
export const listPreparations = async () =>
  (await request<{ preparations: Preparation[] }>(base)).preparations;
export const createPreparation = async (input: {
  title: string;
  subject: string;
  grade?: string;
  edition?: string;
  requirements?: string;
  operationId: string;
}) =>
  (await request<{ preparation: PreparationDetail }>(base, json("POST", input)))
    .preparation;
export const getPreparation = async (id: string) =>
  (
    await request<{ preparation: PreparationDetail }>(
      `${base}/${encodeURIComponent(id)}`,
    )
  ).preparation;
export const updatePreparation = async (
  id: string,
  input: Partial<Preparation> & {
    operationId: string;
    expectedUpdatedAt?: string;
  },
) => request(`${base}/${encodeURIComponent(id)}`, json("PATCH", input));
export const savePreparationDocument = async (
  id: string,
  documentId: string,
  input: {
    expectedRevision: number;
    operationId: string;
    content: RichDocument;
    title?: string;
    autosave?: boolean;
  },
) =>
  (
    await request<{ document: DocumentRecord }>(
      docPath(id, documentId),
      json("PUT", input),
    )
  ).document;
export const checkpointPreparationDocument=async(id:string,documentId:string,expectedRevision:number)=>(await request<{document:DocumentRecord}>(`${docPath(id,documentId)}/checkpoint`,json('POST',{expectedRevision,operationId:crypto.randomUUID()}))).document;
export const listDocumentRevisions = async (id: string, documentId: string) =>
  (
    await request<{ revisions: DocumentRevision[] }>(
      `${docPath(id, documentId)}/revisions`,
    )
  ).revisions;
export const getDocumentRevision = async (
  id: string,
  documentId: string,
  revision: number,
) =>
  (
    await request<{ document: DocumentRevision }>(
      `${docPath(id, documentId)}/revisions/${revision}`,
    )
  ).document;
export const restoreDocumentRevision = async (
  id: string,
  documentId: string,
  revision: number,
  expectedRevision: number,
  operationId: string,
) =>
  (
    await request<{ document: DocumentRecord }>(
      `${docPath(id, documentId)}/restore`,
      json("POST", { revision, expectedRevision, operationId }),
    )
  ).document;
export const forkPreparationDocument = async (
  id: string,
  input: { documentId: string; title: string; operationId: string },
) =>
  (
    await request<{ document: DocumentRecord }>(
      `${base}/${encodeURIComponent(id)}/documents`,
      json("POST", {
        ...input,
        sourceDocumentId: input.documentId,
        documentId: undefined,
      }),
    )
  ).document;
export const attachPreparationSource = async (
  id: string,
  input: {
    kind: "pool" | "resource";
    id: string;
    role: PreparationSource["role"];
    operationId: string;
  },
) => request(`${base}/${encodeURIComponent(id)}/sources`, json("POST", input));
export const detachPreparationSource = async (id: string, sourceId: string) =>
  request(
    `${base}/${encodeURIComponent(id)}/sources/${encodeURIComponent(sourceId)}`,
    { method: "DELETE" },
  );
export const applyDocumentProposal = async (
  id: string,
  proposalId: string,
  operationId: string,
) =>
  request(
    `${base}/${encodeURIComponent(id)}/proposals/${encodeURIComponent(proposalId)}/apply`,
    json("POST", { operationId }),
  );
export const discardDocumentProposal = async (id: string, proposalId: string) =>
  request(
    `${base}/${encodeURIComponent(id)}/proposals/${encodeURIComponent(proposalId)}/discard`,
    json("POST", { operationId: crypto.randomUUID() }),
  );
export const importPreparationSource = async (
  id: string,
  input: {
    sourceId: string;
    operationId: string;
    documentId: string;
    expectedRevision: number;
  },
) =>
  request<{ document: DocumentRecord; warnings: string[] }>(
    `${base}/${encodeURIComponent(id)}/import`,
    json("POST", input),
  );
export interface DocumentExport {
  id: string;
  url: string;
  fileName: string;
  revision: number;
  format: "docx" | "pdf";
  warnings?: string[];
}
export const exportPreparationDocument = async (
  id: string,
  documentId: string,
  revision: number,
  format: "docx" | "pdf",
  operationId = crypto.randomUUID(),
) =>
  (
    await request<{ export: DocumentExport }>(
      `${docPath(id, documentId)}/exports`,
      json("POST", { revision, format, operationId }),
    )
  ).export;
export const uploadPreparationImage = async (id: string, file: File) => {
  const body = new FormData();
  body.set("file", file);
  return (
    await request<{
      asset: {
        id: string;
        url: string;
        fileName: string;
        width: number;
        height: number;
      };
    }>(`${base}/${encodeURIComponent(id)}/assets`, { method: "POST", body })
  ).asset;
};
export const cancelPreparationTask = async (id: string, taskId: string) =>
  request<{ warning?: string }>(
    `${base}/${encodeURIComponent(id)}/tasks/${encodeURIComponent(taskId)}/cancel`,
    json("POST", { operationId: crypto.randomUUID() }),
  );

export const listPreparationSessions = async (id: string) =>
  (await request<{ sessions: PreparationSessionBinding[] }>(`${base}/${encodeURIComponent(id)}/sessions`)).sessions;
