/** Trusted UI selection; the server resolves ownership and the native session. */
export interface PreparationAssistantContext {
  preparationId?: string;
  documentId?: string;
  revision?: number;
  selection?: { blockIds: string[]; text: string };
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
