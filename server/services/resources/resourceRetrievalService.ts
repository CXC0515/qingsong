import {resourceRepository} from '../../repositories/resourceRepository';
import type {LibraryResource} from '../../../src/domain/types';
interface RetrievalRequest {
 query:string;subject?:string;grade?:string;edition?:string;
 resourceKinds?:LibraryResource['kind'][];preferredResourceIds?:string[];allowedResourceIds?:string[];limit?:number;
}
/** Selection limits the candidate set before retrieval. Preference only ranks that set. */
export function retrieveTeachingContext({query,subject,grade,edition,resourceKinds,preferredResourceIds=[],allowedResourceIds,limit=10}:RetrievalRequest){
 const resources=resourceRepository.listResources().filter(resource=>
  (!subject||resource.subject===subject)&&(!grade||resource.grade===grade)&&(!edition||resource.edition===edition)&&
  (!resourceKinds?.length||resourceKinds.includes(resource.kind))&&(!allowedResourceIds||allowedResourceIds.includes(resource.id)));
 const resourceById=new Map(resources.map(resource=>[resource.id,resource]));
 const nodes=resourceRepository.searchNodes(query,subject,limit).filter(node=>!grade||node.grade===grade);
 const nodeIds=new Set(nodes.map(node=>node.id));
 const graphLinks=resourceRepository.listSourceLinks().filter(link=>nodeIds.has(link.nodeId)&&resourceById.has(link.resourceId));
 // listChunks applies the teacher's excluded-page state; raw ID lookups do not.
 const graphChunkIds=new Set(graphLinks.map(link=>link.chunkId));
 const graphChunks=[...new Set(graphLinks.map(link=>link.resourceId))].flatMap(id=>resourceRepository.listChunks(id).filter(chunk=>graphChunkIds.has(chunk.id)));
 const fallbackChunks=graphChunks.length?[]:resources.flatMap(resource=>resourceRepository.retrieveResourceChunks(resource.id,query,limit+1));
 const priority=(id:string)=>preferredResourceIds.includes(id)?3:resourceById.get(id)?.isPrimary?2:resourceById.get(id)?.kind==='textbook'?1:0;
 const all=graphChunks.length?graphChunks:fallbackChunks;
 const chunks=all.sort((a,b)=>priority(b.resourceId)-priority(a.resourceId)||a.order-b.order).slice(0,limit);
 return {
  mode:graphChunks.length?'knowledge-graph':'content-fallback',matchedNodes:nodes,
  coverage:{resources:resources.length,returnedChunks:chunks.length,complete:all.length<=limit,scope:'仅筛选后资料中已解析且未排除的内容；不代表完整教材'},
  relations:resourceRepository.listRelations().filter(relation=>nodeIds.has(relation.sourceNodeId)||nodeIds.has(relation.targetNodeId)),
  citations:chunks.map(chunk=>{const resource=resourceById.get(chunk.resourceId)!;return {
   resourceId:resource.id,resourceTitle:resource.title,resourceKind:resource.kind,chunkId:chunk.id,
   pageStart:chunk.pageStart,pageEnd:chunk.pageEnd,quote:chunk.text,
   sourceUrl:`${resource.publicUrl}#page=${chunk.pageStart}`,isPrimary:resource.isPrimary,
  };}),
 };
}
