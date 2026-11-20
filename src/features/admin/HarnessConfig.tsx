import {useState,type Dispatch,type SetStateAction} from 'react';
import {Maximize2,Minimize2,Pencil,Save,X} from 'lucide-react';
export type ConfigFile={id:string;name:string;kind:'markdown'|'json';content:string};
export type HarnessSkill={id:string;name:string;description:string;archived?:boolean;files:ConfigFile[];emptyFolders:string[]};
export type HarnessConfig={revision:number;updatedAt:string|null;nodes:{id:string;title:string;kind:'prompt'|'skill';enabled:boolean;content:string}[];library:HarnessSkill[]};
export type TraceEvent={seq:number;at:string;node:string;title:string;status:string;revision:number;callId?:string;data:Record<string,any>};
export function useHarnessDrafts(setConfig:Dispatch<SetStateAction<HarnessConfig|null>>){
 const [notice,setNotice]=useState<{id:string;text:string;error:boolean}|null>(null);
 const value=(f:ConfigFile)=>f.content;
 const update=(f:ConfigFile,text:string)=>setConfig(c=>{if(!c)return c;return f.id.startsWith('node/')?{...c,nodes:c.nodes.map(n=>n.id===f.id.slice(5)?{...n,content:text}:n)}:{...c,library:c.library.map(s=>({...s,files:s.files.map(file=>file.id===f.id?{...file,content:text}:file)}))};});
 return {value,discard:(_f:ConfigFile)=>setNotice(null),update,notice,persist:(f:ConfigFile)=>{if(f.kind==='json'){try{JSON.parse(value(f));}catch{setNotice({id:f.id,text:'JSON 格式有误',error:true});return false;}}setNotice(null);return true;}};
}
export type HarnessDrafts=ReturnType<typeof useHarnessDrafts>;
export function ConfigEditor({file,drafts,expanded,onExpand}:{file:ConfigFile;drafts:HarnessDrafts;expanded?:boolean;onExpand?:()=>void}){
 const [editing,setEditing]=useState(false),[original,setOriginal]=useState(file.content);
 return <div className="hc-editor"><div className="hc-editor-title"><strong>{file.name}</strong><div className="hc-editor-title-actions">{!editing&&<button type="button" className="hc-icon-button" aria-label={'编辑 '+file.name} onClick={()=>{setOriginal(file.content);setEditing(true);}}><Pencil size={16}/></button>}{onExpand&&<button type="button" className="hc-icon-button" aria-label="调整窗格宽度" onClick={onExpand}>{expanded?<Minimize2 size={16}/>:<Maximize2 size={16}/>}</button>}</div></div>{editing?<textarea aria-label={file.name} value={drafts.value(file)} spellCheck={false} onChange={e=>drafts.update(file,e.target.value)}/>:<pre className="hc-config-readonly">{file.content}</pre>}{drafts.notice?.id===file.id&&<p role="alert">{drafts.notice.text}</p>}{editing&&<div className="hc-editor-actions"><button type="button" onClick={()=>{drafts.update(file,original);drafts.discard(file);setEditing(false);}}><X size={14}/>撤销本次编辑</button><button type="button" onClick={()=>{if(drafts.persist(file))setEditing(false);}}><Save size={14}/>完成编辑</button></div>}</div>;
}
