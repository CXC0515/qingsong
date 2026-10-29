import {retrieveTeachingContext} from '../../resources/resourceRetrievalService';
import {createHash} from 'node:crypto';
import {readFile,realpath,lstat} from 'node:fs/promises';
import path from 'node:path';
import {getWorkspaceContext} from '../../../context/workspaceContext';
import {readAssistantMaterial} from '../materialReader';
import {CapabilityError} from './contract';
import {resourceRepository as repo} from '../../../repositories/resourceRepository';
import {missing,matches,ref,paged,envelope,type SearchArgs,type ReadArgs} from './contract';
export function searchResources(a:SearchArgs){
 const f=a.filters;
 if(a.type==='resource'){
  const resources=repo.listResources().filter(r=>(!f.subject||r.subject===f.subject)&&(!f.kind||r.kind===f.kind)&&(!f.grade||r.grade===f.grade));
  const contentMatches=new Map(a.query?repo.matchResourceContents(a.query).map(row=>[row.resourceId,row.matches]):[]);
  const items=resources.flatMap(r=>matches(a.query,r.title,r.fileName,r.summary,r.tags.join(' '))||contentMatches.has(r.id)?[{ref:ref('resource',r.id),title:r.title,kind:r.kind,subject:r.subject,status:r.status,pageCount:r.pageCount,matchedChunkCount:contentMatches.get(r.id)??0}]:[]);
  return paged(items,a,'/api/resources');
 }
 if(a.type==='knowledge')return paged(repo.listNodes().filter(n=>(!f.subject||n.subject===f.subject)&&(!f.kind||n.type===f.kind)&&matches(a.query,n.name,n.description,n.code,n.aliases.join(' '))).map(n=>({ref:ref('knowledge',n.id),name:n.name,type:n.type,subject:n.subject,version:n.version})),a,'/api/knowledge');
}
export async function readResources(a:ReadArgs, signal?:AbortSignal){
 const {id,type}=a.ref;
 if(type==='resource'){
  const r=repo.getStoredResource(id);if(!r)missing();const url=r.publicUrl;
  if(a.section==='original'){
   const root=await realpath(getWorkspaceContext().uploadDirectory);
   const file=await realpath(r.diskPath);const info=await lstat(r.diskPath);
   if(!file.startsWith(root+path.sep)||info.isSymbolicLink()||!info.isFile()||info.size>30*1024*1024)throw new CapabilityError('RESOURCE_UNREADABLE','资料原件不可读取或超过30MB。数据未修改，请到资料页面核对或分拆文件。');
   if(a.limit>10)throw new CapabilityError('INVALID_RANGE','原文每次最多10页，请减小limit。资料未修改。');
   const bytes=await readFile(file,{signal});
   const result=await readAssistantMaterial({filePath:file,fileName:r.fileName,mimeType:r.mimeType,sha256:createHash('sha256').update(bytes).digest('hex')},{action:'read',start:a.offset+1,limit:a.limit,signal});
   return envelope(result,url,undefined,!result.coverage.complete);
  }
  if(a.section==='chunks')return paged(repo.listChunks(id),a,url);
  if(a.section==='pages'){
   const pages=repo.listResourcePages(id);const chunks=repo.listChunks(id);
   return paged(pages.map(p=>({...p,chunks:chunks.filter(c=>c.pageStart<=p.pageNumber&&c.pageEnd>=p.pageNumber),sourceUrl:url+'#page='+p.pageNumber})),a,url,pages.some(p=>p.included&&p.parseStatus!=='ready'));
  }
  if(a.section==='jobs')return paged(repo.listProcessingJobs(id),a,url,true);
  if(a.section==='suggestions')return paged(repo.listSuggestions(id),a,url);
  const {diskPath,...detail}=r;return envelope({...detail,pageStates:repo.listResourcePages(id).map(p=>({pageNumber:p.pageNumber,included:p.included,parseStatus:p.parseStatus})),reading:'pages读取已解析页内容，chunks读取文字块；尚未解析不代表原页无内容。'},url);
 }
 if(type==='knowledge'){
  const n=repo.getNode(id);if(!n||n.status!=='active')missing();const url='/api/knowledge/nodes/'+encodeURIComponent(id)+'/focus';
  if(a.section==='context')return envelope(retrieveTeachingContext({query:n.name,subject:n.subject,limit:Math.min(a.limit,30)}),url,undefined,true);
  if(a.section==='relations')return paged(repo.listRelations().filter(r=>r.sourceNodeId===id||r.targetNodeId===id),a,url);
  if(a.section==='children')return paged(repo.listNodes().filter(c=>c.primaryMotherId===id).map(c=>({...c,ref:ref('knowledge',c.id)})),a,url);
  if(a.section==='sources')return paged(repo.listSourceLinks().filter(s=>s.nodeId===id).map(s=>({...s,resourceRef:ref('resource',s.resourceId)})),a,url);
  if(a.section==='revisions')return paged(repo.listRevisions('node',id),a,url);
  return envelope(n,url);
 }
}
