import {memorySettings,memoryUserId,memoryCollection,type MemorySettings} from './memoryConfig';

export interface MemoryHit {id:string;memory:string;score?:number;metadata?:Record<string,unknown>;score_details?:{semanticScore:number};}
export interface MemoryClient {
  add(text:string,metadata:Record<string,unknown>):Promise<MemoryHit[]>;
  search(query:string):Promise<MemoryHit[]>;
  get(id:string):Promise<MemoryHit|null>;
  update(id:string,text:string):Promise<void>;
  delete(id:string):Promise<void>;
}
let factoryOverride:((config:NonNullable<MemorySettings>)=>Promise<MemoryClient>)|undefined;
const clients=new Map<string,Promise<MemoryClient>>();
export function setMemoryClientFactoryForTests(factory?:typeof factoryOverride) {factoryOverride=factory;clients.clear();}
export async function getMemoryClient():Promise<MemoryClient|null> {
  const config=memorySettings();if(!config)return null;
  if(factoryOverride)return factoryOverride(config);
  const userId=memoryUserId(),collection=memoryCollection(config),key=userId+config.fingerprint;
  let pending=clients.get(key);
  if(!pending){
    pending=(async()=>{
      // Disable upstream telemetry before the dynamic import evaluates.
      process.env.MEM0_TELEMETRY='false';
      const {Memory}=await import('mem0ai/oss');
      const {QdrantClient}=await import('@qdrant/js-client-rest');
      const rawVectorClient=new QdrantClient({url:config.qdrantUrl,apiKey:config.qdrantKey,timeout:8000,checkCompatibility:false});
      // SDK logs provider errors. Strip transport bodies before they can contain user payloads or credentials.
      const vectorClient=new Proxy(rawVectorClient,{get(target,key){
        const value=Reflect.get(target,key);if(typeof value!=='function')return value;
        return async(...args:any[])=>{
          if(['upsert','delete','createPayloadIndex'].includes(String(key))&&args[1])args[1]={...args[1],wait:true};
          try{return await value.apply(target,args);}catch(error){
            const status=typeof error==='object'&&error!==null&&'status' in error?Number(error.status):undefined;
            throw Object.assign(Error('MEMORY_VECTOR_REQUEST_FAILED'),{status});
          }
        };
      }});
      const embed=async(input:string[])=>{
        const response=await fetch(config.embedder.baseURL+'/embeddings',{method:'POST',signal:AbortSignal.timeout(8000),
          headers:{authorization:'Bearer '+config.embedder.apiKey,'content-type':'application/json'},
          body:JSON.stringify({model:config.embedder.model,input,encoding_format:'float'})});
        if(!response.ok)throw Error('MEMORY_EMBEDDING_UNAVAILABLE');
        const payload=await response.json();
        const rows=Array.isArray(payload.data)?payload.data.slice().sort((a:any,b:any)=>a.index-b.index):[];
        if(rows.length!==input.length||rows.some((row:any)=>!Array.isArray(row.embedding)||row.embedding.length!==config.dimensions||row.embedding.some((n:unknown)=>typeof n!=='number'||!Number.isFinite(n))))throw Error('MEMORY_EMBEDDING_INVALID');
        return rows.map((row:any)=>row.embedding as number[]);
      };
      const memory=new Memory({disableHistory:true,
        llm:{provider:'openai',config:{...config.llm,temperature:0,timeout:20000,maxTokens:1500}},
        embedder:{provider:'langchain',config:{model:{embedQuery:async(text:string)=>(await embed([text]))[0],embedDocuments:embed}}},
        vectorStore:{provider:'qdrant',config:{client:vectorClient,collectionName:collection,dimension:config.dimensions}},
      });
      return {
        add:async(text,metadata)=>(await memory.add([{role:'user',content:text}],{userId,infer:false,metadata})).results,
        search:async query=>(await memory.search(query,{filters:{user_id:userId},topK:12,threshold:config.threshold,explain:true})).results,
        get:async id=>await memory.get(id),
        update:async(id,text)=>{await memory.update(id,{text});},
        delete:async id=>{await memory.delete(id);},
      };
    })();
    clients.set(key,pending);
    pending.catch(()=>clients.delete(key));
  }
  return pending;
}
