import type { DocumentNode, RichDocument } from "./document";
/** Stable block IDs keep an AI review focused even when unchanged sections move down. */
export function documentChanges(before: RichDocument, after: RichDocument) {
  const identity = (node: DocumentNode, index: number) =>
    String(node.attrs?.id ?? `position-${index}`);
  const original = new Map(
    before.content.map((node, index) => [identity(node, index), node]),
  );
  const proposed = new Map(
    after.content.map((node, index) => [identity(node, index), node]),
  );
  const changed = new Set<string>();
  for (const [id, node] of original)
    if (
      proposed.has(id) &&
      JSON.stringify(node) !== JSON.stringify(proposed.get(id))
    )
      changed.add(id);
  const originalOrder = [...original.keys()].filter((id) => proposed.has(id));
  const proposedOrder = [...proposed.keys()].filter((id) => original.has(id));
  originalOrder.forEach((id, index) => {
    if (id !== proposedOrder[index]) {
      changed.add(id);
      changed.add(proposedOrder[index]);
    }
  });
  const added = [...proposed.keys()].filter((id) => !original.has(id));
  const removed = [...original.keys()].filter((id) => !proposed.has(id));
  return {
    changed: changed.size,
    added: added.length,
    removed: removed.length,
    hasChanges: Boolean(changed.size + added.length + removed.length),
    before: {
      type: "doc",
      content: before.content.filter(
        (node, index) =>
          changed.has(identity(node, index)) ||
          !proposed.has(identity(node, index)),
      ),
    } as RichDocument,
    after: {
      type: "doc",
      content: after.content.filter(
        (node, index) =>
          changed.has(identity(node, index)) ||
          !original.has(identity(node, index)),
      ),
    } as RichDocument,
  };
}
