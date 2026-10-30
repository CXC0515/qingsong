import {createHash} from 'node:crypto';
import {z} from 'zod';
import {getWorkspaceContext} from '../../context/workspaceContext';

export type MemorySettings = ReturnType<typeof memorySettings>;
export function memorySettings() {
  if(process.env.QS_MEMORY_ENABLED !== 'true')return null;
  const required=(name:string)=>{const value=process.env[name]?.trim();if(!value)throw Error('MEMORY_CONFIG_INCOMPLETE');return value;};
  const endpoint=(name:string)=>z.url().parse(required(name)).replace(/\/$/,'');
  const dimensions=z.coerce.number().int().min(1).max(65536).parse(required('QS_MEMORY_EMBEDDING_DIMENSIONS'));
  const threshold=z.coerce.number().min(0).max(1).parse(process.env.QS_MEMORY_THRESHOLD??'0.55');
  const qdrantUrl=endpoint('QS_MEMORY_QDRANT_URL');
  const llm={model:required('QS_MEMORY_LLM_MODEL'),baseURL:endpoint('QS_MEMORY_LLM_BASE_URL'),apiKey:required('QS_MEMORY_LLM_API_KEY')};
  const embedder={model:required('QS_MEMORY_EMBEDDING_MODEL'),baseURL:endpoint('QS_MEMORY_EMBEDDING_BASE_URL'),apiKey:required('QS_MEMORY_EMBEDDING_API_KEY')};
  return {llm,embedder,dimensions,threshold,qdrantUrl,qdrantKey:process.env.QS_MEMORY_QDRANT_API_KEY?.trim(),
    fingerprint:createHash('sha256').update(JSON.stringify([llm,embedder,dimensions,qdrantUrl,process.env.QS_MEMORY_QDRANT_API_KEY])).digest('hex')};
}
export function memoryUserId() {return createHash('sha256').update(getWorkspaceContext().userId).digest('hex');}
export function memoryCollection(config:NonNullable<MemorySettings>) {
  // Separate collections additionally contain SDK methods which do not accept user filters.
  const index=createHash('sha256').update(JSON.stringify([config.embedder.model,config.embedder.baseURL,config.dimensions,config.qdrantUrl])).digest('hex').slice(0,12);
  return 'qs_memory_'+memoryUserId().slice(0,24)+'_'+index;
}
