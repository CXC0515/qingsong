import {useState} from 'react';
import {ArrowLeft,Wrench} from 'lucide-react';
import {GlassSegments} from '../../components/glass/Glass';
import {harnessToolDefinitions} from '../../domain/harnessToolDefinitions.mjs';
import {ConfigEditor,type HarnessConfig,type HarnessDrafts,type TraceEvent} from './HarnessConfig';

export function HarnessMemoryWorkspace({config,drafts}:{config:HarnessConfig;drafts:HarnessDrafts}){
 const [group,setGroup]=useState('write');
 const nodeIds=group==='write'?['memory-write']:['memory-recall','memory-relevance'];
 return <div className="hc-system-config">
  <div className="hc-config-sections"><GlassSegments label="Memory 系统规则" value={group} options={[{value:'write',label:'写入规则'},{value:'recall',label:'调取规则'},{value:'storage',label:'存储与隔离'}]} onChange={setGroup} density="compact"/></div>
  {group==='storage'?<div className="hc-inspector-body"><h4>存储策略</h4><dl className="hc-tool-source"><div><dt>事实来源</dt><dd>SQLite personal_entries</dd></div><div><dt>历史版本</dt><dd>personal_revisions</dd></div><div><dt>语义索引</dt><dd>mem0 / Qdrant</dd></div><div><dt>隔离方式</dt><dd>用户标识哈希与嵌入配置共同确定索引空间</dd></div><div><dt>召回校验</dt><dd>版本、正文与有效状态一致后进入上下文</dd></div><div><dt>不可用处理</dt><dd>继续对话，不加入个人记忆</dd></div></dl><p>由代码维护</p></div>:<>
   {nodeIds.map(id=>config.nodes.find(n=>n.id===id)).filter(Boolean).map(node=><ConfigEditor key={node!.id} file={{id:'node/'+node!.id,name:node!.title,kind:node!.id==='memory-recall'?'json':'markdown',content:node!.content}} drafts={drafts}/>)}
   {group==='write'&&<details className="hc-fixed-rules"><summary>固定写入约束</summary><p>每轮最多 8 项；正文最多 600 字；依据最多 1000 字；有效记忆最多 60 条。由代码维护。</p></details>}
  </>}
 </div>;
}
// Native DSH contract from the installed dsh-tool-skill package.
const nativeSkill={name:'skill',title:'加载 Skill',mode:'能力读取',source:'DSH dsh-tool-skill',description:'Load the full instructions for a skill. Call it before acting on a task that names or clearly matches a skill in the session skill catalog.',parameters:{name:{type:'string',required:true,description:'The exact skill name from the available skills list.'}}};
const catalog=[nativeSkill,...harnessToolDefinitions];
export function HarnessToolsWorkspace({events,onBack}:{events:TraceEvent[];onBack:()=>void}){
 const [selected,setSelected]=useState('skill');
 const [level,setLevel]=useState<'list'|'detail'>('list');
 const recorded=events.flatMap(e=>e.node==='tools'&&Array.isArray(e.data?.tools)?[e.data.tools]:[]).at(-1);
 const tools=recorded?recorded.map((t:any)=>({...catalog.find(c=>c.name===t.name),...t})):catalog;
 const tool=tools.find(t=>t.name===selected)??tools[0];
 return <section className="hc-tools-workspace" data-level={level} aria-label="工具目录">
  <div className="hc-skill-toolbar"><button type="button" onClick={onBack}><ArrowLeft size={16}/>返回画布</button><h2>Tools 工具库</h2><span>{recorded?'本轮模型可见定义':'当前注册定义'}</span></div>
  <div className="hc-tools-panes">
   <nav className="hc-tools-list" aria-label="工具列表"><div className="hc-pane-title">工具<span>{tools.length}</span></div>{tools.map(t=><button key={t.name} type="button" aria-pressed={tool?.name===t.name} onClick={()=>{setSelected(t.name);setLevel('detail');}}><Wrench size={18}/><span><strong>{t.title??t.name}</strong><code>{t.name}</code><small>{t.mode??'运行定义'}</small></span></button>)}{!tools.length&&<p>本轮未披露工具。</p>}</nav>
   <div className="hc-tool-detail">{tool&&<><header className="hc-tool-detail-head"><button type="button" className="hc-mobile-back" aria-label="返回工具列表" onClick={()=>setLevel('list')}><ArrowLeft size={16}/></button><div><h2>{tool.title??tool.name}</h2><code>{tool.name}</code></div></header><div className="hc-tool-content">
    <section><h3>工具说明</h3><p>{tool.description}</p></section>
    <section><h3>参数定义</h3><pre>{JSON.stringify(tool.parameters??tool.inputSchema??{},null,2)}</pre></section>
    {tool.source&&<dl className="hc-tool-source"><div><dt>实现来源</dt><dd>{tool.source}</dd></div></dl>}
    {!!events.length&&<section><h3>实际调用</h3>{events.filter(e=>e.data?.tool===tool.name).map(e=><details key={e.seq}><summary>{e.title} / {e.status}</summary><pre>{JSON.stringify(e.data,null,2)}</pre></details>)}</section>}
   </div></>}</div>
  </div>
 </section>;
}
