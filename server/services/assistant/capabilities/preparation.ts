import {
  getPreparation,
  listPreparations,
  getDocument,
  listRevisions,
  resolveSourceFile,
} from "../../preparation/preparationService";
import { readAssistantMaterial } from "../materialReader";
import {
  missing,
  matches,
  paged,
  envelope,
  type SearchArgs,
  type ReadArgs,
} from "./contract";
const sourceUrl = (id: string) =>
  "/?page=lesson-plan&preparationId=" + encodeURIComponent(id);
export function searchPreparation(a: SearchArgs) {
  if (a.type === "preparation")
    return paged(
      listPreparations()
        .filter(
          (p) =>
            (!a.filters.subject || p.subject === a.filters.subject) &&
            matches(a.query, p.title, p.requirements),
        )
        .map((p) => ({ ...p, ref: { type: "preparation", id: p.id } })),
      a,
      "/?page=lesson-plan",
    );
  if (a.type !== "lessonPlan" && a.type !== "preparationSource") return;
  const prepId = String(a.filters.preparationId ?? "");
  if (!prepId) missing();
  const detail = getPreparation(prepId);
  const items = a.type === "lessonPlan" ? detail.documents : detail.sources;
  return paged(
    items
      .filter((p) => matches(a.query, p.title))
      .map((p) => ({
        ...p,
        ...("content" in p ? { content: undefined } : {}),
        ref: { type: a.type, id: p.id, parentId: prepId },
      })),
    a,
    sourceUrl(prepId),
  );
}
export async function readPreparation(a: ReadArgs, signal?: AbortSignal) {
  const { type, id, parentId } = a.ref;
  if (type === "preparation") {
    const p = getPreparation(id);
    if (a.section === "sources")
      return paged(
        p.sources.map((s) => ({
          ...s,
          ref: { type: "preparationSource", id: s.id, parentId: id },
        })),
        a,
        sourceUrl(id),
      );
    if (a.section === "documents")
      return paged(
        p.documents.map(({ content, ...d }) => ({
          ...d,
          ref: { type: "lessonPlan", id: d.id, parentId: id },
        })),
        a,
        sourceUrl(id),
      );
    if (a.section === "tasks") return paged(p.tasks, a, sourceUrl(id));
    return envelope(p.preparation, sourceUrl(id));
  }
  if (type !== "lessonPlan" && type !== "preparationSource") return;
  if (!parentId) missing();
  getPreparation(parentId);
  if (type === "lessonPlan") {
    if (a.section === "revisions")
      return paged(
        listRevisions(parentId, id).map(({ content, ...r }) => r),
        a,
        sourceUrl(parentId),
      );
    const d = getDocument(
      parentId,
      id,
      a.filters.revision === undefined ? undefined : Number(a.filters.revision),
    );
    return a.section === "content"
      ? paged(d.content.content, a, sourceUrl(parentId), false, {
          documentId: id,
          revision: d.revision,
        })
      : envelope({ ...d, content: undefined }, sourceUrl(parentId));
  }
  const detail = getPreparation(parentId),
    source = detail.sources.find((s) => s.id === id);
  if (!source) missing();
  if (a.section === "detail") return envelope(source, sourceUrl(parentId));
  const file = await resolveSourceFile(parentId, id);
  if (file.mimeType.startsWith("image/"))
    return envelope(
      {
        message:
          "此材料是图片，请使用qingsong_preparation的render查看，不得声称已读取图片内容。",
        source,
      },
      sourceUrl(parentId),
      undefined,
      true,
    );
  const result = await readAssistantMaterial(file, {
    action: "read",
    start: a.offset + 1,
    limit: Math.min(a.limit, 10),
    signal,
  });
  if (result.images)
    return envelope(
      {
        message:
          "此材料是图片，请使用qingsong_preparation的render查看，不得声称已读取图片内容。",
        source,
      },
      sourceUrl(parentId),
      undefined,
      true,
    );
  return envelope(
    result,
    sourceUrl(parentId),
    undefined,
    !result.coverage?.complete,
  );
}
