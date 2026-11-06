/** Shared, versioned editor document. HTML and model-generated paths are never persisted. */
export interface DocumentMark {
  type: string;
  attrs?: Record<string, unknown>;
}
export interface DocumentNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: DocumentNode[];
  text?: string;
  marks?: DocumentMark[];
}
export interface RichDocument {
  type: "doc";
  content: DocumentNode[];
}
export const emptyDocument = (): RichDocument => ({
  type: "doc",
  content: [{ type: "paragraph" }],
});
export function documentText(document: RichDocument): string {
  const visit = (node: DocumentNode): string =>
    node.text ??
    (node.content ?? [])
      .map(visit)
      .join(
        ["paragraph", "heading", "tableRow", "listItem"].includes(node.type)
          ? " "
          : "",
      );
  return document.content.map(visit).join("\n");
}
export interface DocumentRecord {
  id: string;
  preparationId: string;
  title: string;
  revision: number;
  content: RichDocument;
  createdAt: string;
  updatedAt: string;
  sourceDocumentId?: string;
}
export interface DocumentRevision extends DocumentRecord {
  versionNumber?: number;
  reason: string;
  actor: "teacher" | "assistant" | "import";
}
