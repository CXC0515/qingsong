import type { DocumentRecord, RichDocument } from "./document";
export interface Preparation {
  id: string;
  title: string;
  subject: string;
  grade: string;
  edition: string;
  classIds: string[];
  requirements: string;
  knowledgeIds: string[];
  status: "draft" | "ready" | "archived";
  createdAt: string;
  updatedAt: string;
}
export interface PreparationSource {
  id: string;
  preparationId: string;
  kind: "pool" | "resource";
  objectId: string;
  role: "base" | "textbook" | "reference";
  title: string;
  mimeType: string;
  sha256: string;
  sourceUrl: string;
  createdAt: string;
}
export interface DocumentProposal {
  id: string;
  preparationId: string;
  documentId: string;
  baseRevision: number;
  content: RichDocument;
  summary: string;
  status: "pending" | "applied" | "discarded";
  createdAt: string;
  appliedRevision?: number;
  inputFingerprint?: string;
}
export type PreparationTaskStatus =
  | "queued"
  | "running"
  | "needs-input"
  | "completed"
  | "cancelled"
  | "failed"
  | "interrupted";
export interface PreparationTask {
  id: string;
  preparationId: string;
  documentId?: string;
  sessionId?: string;
  status: PreparationTaskStatus;
  stage: string;
  instruction: string;
  message?: string;
  result?: unknown;
  createdAt: string;
  updatedAt: string;
}
export interface PreparationDetail {
  preparation: Preparation;
  documents: DocumentRecord[];
  sources: PreparationSource[];
  proposals: DocumentProposal[];
  tasks: PreparationTask[];
}
export interface PreparationSessionBinding {
  sessionId: string;
  nativeWorkspaceId: string;
  preparationId: string;
  documentId?: string;
  updatedAt: string;
}
