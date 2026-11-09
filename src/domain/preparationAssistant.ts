import type { DocumentSelection } from "../components/document/documentSelection";
/** Trusted UI selection; the server resolves ownership and the native session. */
export interface PreparationAssistantContext {
  sessionId?: string;
  preparationId?: string;
  documentId?: string;
  revision?: number;
  selection?: DocumentSelection;
  instruction?: string;
  resumeOnly?: boolean;
}
export interface PreparationAssistantTarget {
  workspaceId: string;
  reference?: {id:string; title:string; revision:number};
  sessionId?: string;
  preparationId?: string;
  documentId?: string;
  revision?: number;
  selection?: PreparationAssistantContext["selection"];
  instruction?: string;
}
