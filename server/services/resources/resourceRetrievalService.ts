import {resourceRepository} from '../../repositories/resourceRepository';
import type {LibraryResource} from '../../../src/domain/types';
export function retrieveTeachingContext({query,subject,resourceKinds,preferredResourceIds=[],limit=10}: {
 query:string;subject?:string;resourceKinds?:LibraryResource['kind'][];preferredResourceIds?:string[];limit?:number;
}) {
  const resources = resourceRepository.listResources();
  const allowedResource = (resourceId: string) => {
    const resource = resources.find((item) => item.id === resourceId);
    return (
      resource &&
      (!resourceKinds?.length || resourceKinds.includes(resource.kind))
    );
  };
  const nodes = resourceRepository.searchNodes(query, subject, limit);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const graphLinks = resourceRepository
    .listSourceLinks()
    .filter(
      (link) => nodeIds.has(link.nodeId) && allowedResource(link.resourceId),
    );
  const graphChunks = resourceRepository.getChunksByIds(
    graphLinks.map((link) => link.chunkId),
  );
  const fallbackChunks = graphLinks.length
    ? []
    : resourceRepository
        .searchChunks(query, limit * 2)
        .filter((chunk) => allowedResource(chunk.resourceId));
  const chunks = (graphChunks.length ? graphChunks : fallbackChunks)
    .sort((first, second) => {
      const firstResource = resources.find(
        (item) => item.id === first.resourceId,
      );
      const secondResource = resources.find(
        (item) => item.id === second.resourceId,
      );
      const priority = (resource?: typeof firstResource) =>
        preferredResourceIds.includes(resource?.id ?? "")
          ? 3
          : resource?.isPrimary
            ? 2
            : resource?.kind === "textbook"
              ? 1
              : 0;
      return (
        priority(secondResource) - priority(firstResource) ||
        first.order - second.order
      );
    })
    .slice(0, limit);
  return {
    mode: graphLinks.length ? "knowledge-graph" : "content-fallback",
    matchedNodes: nodes,
    relations: resourceRepository
      .listRelations()
      .filter(
        (relation) =>
          nodeIds.has(relation.sourceNodeId) ||
          nodeIds.has(relation.targetNodeId),
      ),
    citations: chunks.map((chunk) => {
      const resource = resources.find((item) => item.id === chunk.resourceId)!;
      return {
        resourceId: resource.id,
        resourceTitle: resource.title,
        resourceKind: resource.kind,
        chunkId: chunk.id,
        pageStart: chunk.pageStart,
        pageEnd: chunk.pageEnd,
        quote: chunk.text,
        sourceUrl: `${resource.publicUrl}#page=${chunk.pageStart}`,
        isPrimary: resource.isPrimary,
      };
    }),
  };
}
