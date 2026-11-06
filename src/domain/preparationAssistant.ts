import type { DocumentSelection } from "../components/document/documentSelection";
/** Trusted UI selection; the server resolves ownership and the native session. */
export interface PreparationAssistantContext {
  sessionId?: string;
  newSessionId?: string;
  preparationId?: string;
  documentId?: string;
  revision?: number;
  selection?: DocumentSelection;
  instruction?: string;
}
export interface PreparationAssistantTarget {
  workspaceId: string;
  sessionId?: string;
  preparationId?: string;
  documentId?: string;
  revision?: number;
  selection?: PreparationAssistantContext["selection"];
  instruction?: string;
}
