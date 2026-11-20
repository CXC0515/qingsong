import {useState} from 'react';
import {ArrowLeft,Wrench} from 'lucide-react';
import {GlassSegments} from '../../components/glass/Glass';
import {ConfigEditor,type HarnessConfig,type HarnessDrafts,type TraceEvent} from './HarnessConfig';
export function HarnessMemoryWorkspace({config,drafts}:{config:HarnessConfig;drafts:HarnessDrafts}){
 const [tab,setTab]=useState('memory-write');const node=config.nodes.find(n=>n.id===tab);
 return <div className="hc-memory-config"><GlassSegments label="记忆管理规则" value={tab} options={[{value:'memory-write',label:'提取'},{value:'memory-recall',label:'召回'},{value:'memory-relevance',label:'筛选'}]} onChange={setTab}/>{node&&<ConfigEditor key={node.id} file={{id:'node/'+node.id,name:node.title,kind:tab==='memory-recall'?'json':'markdown',content:node.content}} drafts={drafts}/>}</div>;
}
export function HarnessToolsWorkspace({tools,events,onBack}:{tools:any[];events:TraceEvent[];onBack:()=>void}){
 const [selected,setSelected]=useState('');const tool=tools.find(t=>t.name===selected)??tools[0];
 return <section className="hc-tools-workspace"><div className="hc-skill-toolbar"><button type="button" onClick={onBack}><ArrowLeft size={16}/>返回画布</button><h2>Tools</h2><span>本轮模型可见定义</span></div><div className="hc-tool-panes"><nav className="hc-tools-list" aria-label="工具列表">{tools.map(t=><button key={t.name} type="button" className={tool?.name===t.name?'is-selected':''} onClick={()=>setSelected(t.name)}><Wrench size={18}/><span><strong>{t.name}</strong></span></button>)}{!tools.length&&<p>选中一次真实运行后查看工具定义。</p>}</nav><div className="hc-tool-content">{tool&&<><h3>{tool.name}</h3><p>{tool.description}</p><section><h4>参数定义</h4><pre>{JSON.stringify(tool.parameters??tool.inputSchema??tool,null,2)}</pre></section><section><h4>实际调用</h4>{events.filter(e=>e.data?.tool===tool.name).map(e=><details key={e.seq}><summary>{e.title} / {e.status}</summary><pre>{JSON.stringify(e.data,null,2)}</pre></details>)}</section></>}</div></div></section>;
}
