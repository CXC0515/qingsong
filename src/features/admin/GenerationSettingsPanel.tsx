import {useEffect,useState} from 'react';
import {ChevronDown,RotateCcw,Save,X} from 'lucide-react';
import {GlassButton} from '../../components/glass/Glass';
import ResponsiveChoiceDialog from '../../components/ResponsiveChoiceDialog';
import ResponsiveDialog from '../../components/ResponsiveDialog';
import {apiFetch} from '../../services/apiClient';
import {generationFields,generationKey,type GenerationAdminState,type GenerationValues,type GenerationField} from '../../domain/generationPolicy';

const effortLabels:Record<string,string>={minimal:'极低',low:'低',medium:'中',high:'高',xhigh:'更高',max:'最高'};
const labels:Record<GenerationField,{label:string;hint:string}>={
  temperature:{label:'温度 · Temperature',hint:'控制输出的随机程度。留空使用模型默认值。'},
  maxTokens:{label:'最大输出 Token',hint:'单次模型回答的输出上限，不是上下文容量，也不等于中文字数。'},
  reasoningEffort:{label:'推理强度',hint:'只提供当前模型配置明确支持的档位。'},
};
export default function GenerationSettingsPanel({onDirtyChange}:{onDirtyChange:(dirty:boolean)=>void}){
  const [state,setState]=useState<GenerationAdminState|null>(null),[selected,setSelected]=useState('');
  const [draft,setDraft]=useState<GenerationValues|null>(null),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false);
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[picker,setPicker]=useState<'model'|'reasoning'|null>(null),[pendingModel,setPendingModel]=useState<string|null>(null);
  const model=state?.models.find(item=>generationKey(item.provider,item.id)===selected);
  const dirty=Boolean(draft&&model&&JSON.stringify(draft)!==JSON.stringify(model.values));
  useEffect(()=>{onDirtyChange(dirty);return()=>onDirtyChange(false);},[dirty,onDirtyChange]);
  useEffect(()=>{if(!dirty)return;const warn=(event:BeforeUnloadEvent)=>event.preventDefault();window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
  const load=async()=>{
    setLoading(true);setError('');setNotice('');
    try{const response=await apiFetch('/api/admin/assistant/generation');const body=await response.json();if(!response.ok)throw Error(body.message||'生成设置未能载入，原配置保持不变，请重试。');setState(body);const chosen=body.models.find((item:GenerationAdminState['models'][number])=>generationKey(item.provider,item.id)===selected)??body.models[0];setSelected(chosen?generationKey(chosen.provider,chosen.id):'');setDraft(chosen?{...chosen.values}:null);}
    catch(error){setError(error instanceof Error&&!(error instanceof TypeError)&&!(error instanceof SyntaxError)?error.message:'连接失败，原配置保持不变，请重试。');}finally{setLoading(false);}
  };
  useEffect(()=>{void load();},[]);
  const choose=(key:string)=>{const next=state?.models.find(item=>generationKey(item.provider,item.id)===key);if(next){setSelected(key);setDraft({...next.values});setError('');setNotice('');}setPendingModel(null);};
  const save=async()=>{
    if(!model||!state||!draft||saving)return;
    setSaving(true);setError('');setNotice('');
    try{
      const response=await apiFetch('/api/admin/assistant/generation',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({revision:state.policy.revision,provider:model.provider,model:model.id,values:draft})});
      const body=await response.json();if(!response.ok)throw Error(body.message||'保存结果无法确认，请重新载入核对；已有配置仍保留。');
      // A separate read confirms the durable value; an unknown response never claims success.
      const checked=await apiFetch('/api/admin/assistant/generation');const verified=await checked.json();if(!checked.ok||verified.policy.revision<body.policy.revision)throw Error('保存回读未完成，请重新载入核对，暂不确认本次结果。');
      const actual=verified.models.find((item:GenerationAdminState['models'][number])=>item.provider===model.provider&&item.id===model.id);
      if(!actual||JSON.stringify(actual.values)!==JSON.stringify(draft))throw Error('当前配置与提交内容不同，可能已被其他管理员更新。请重新载入核对。');
      setState(verified);setDraft({...actual.values});setNotice('配置已保存并回读确认，从下一轮对话生效；正在处理的一轮保持原配置。');
    }catch(error){setError(error instanceof Error&&!(error instanceof TypeError)&&!(error instanceof SyntaxError)?error.message:'保存结果未确认，请重新载入核对。');}finally{setSaving(false);}
  };
  return <div className="qs-admin-settings">
    <div className="qs-admin-toolbar"><GlassButton disabled={saving||loading||!state?.models.length} onClick={()=>setPicker('model')} className="qs-admin-model-picker" aria-haspopup="dialog" aria-label="选择生成参数模型"><span>{model?.name??'选择模型'}{model?<small>{model.provider}</small>:null}</span><ChevronDown className="h-4 w-4 shrink-0" /></GlassButton><span className="qs-muted">{state?`版本 ${state.policy.revision} · 对所有教师的教学助手生效`:''}</span></div>
    {error&&<div className="qs-admin-feedback" role="alert"><p>{error}</p><GlassButton variant="ghost" aria-label="关闭错误提示" onClick={()=>setError('')}><X className="h-4 w-4" /></GlassButton></div>}
    {notice&&<p role="status" className="qs-admin-notice">{notice}</p>}
    {loading?<p role="status" className="qs-admin-empty">正在载入生成设置…</p>:!model||!draft?<p className="qs-admin-empty">尚无可配置模型，请先在模型连接中配置供应商与模型。</p>:<section className="qs-admin-section" aria-label="模型生成参数">
      <div className="qs-admin-parameter-list">{generationFields.map(field=>{
        const capability=model.capabilities[field],value=draft[field],copy=labels[field];
        return <div className="qs-admin-parameter" key={field}><label htmlFor={'generation-'+field}><strong>{copy.label}</strong><span>{copy.hint}</span>{!capability.supported&&<small>{capability.reason}</small>}</label><div className="qs-admin-value">
          {field==='reasoningEffort'?<GlassButton id={'generation-'+field} disabled={saving||!capability.supported} onClick={()=>setPicker('reasoning')} className="qs-admin-choice" aria-haspopup="dialog"><span>{(effortLabels[String(value)]??value)??'模型默认值'}</span><ChevronDown className="h-4 w-4 shrink-0" /></GlassButton>:<input id={'generation-'+field} aria-label={copy.label} className="qs-field-input" type="number" inputMode={capability.limits?.step===1?'numeric':'decimal'} min={capability.limits?.min} max={capability.limits?.max} step={capability.limits?.step??'any'} placeholder={capability.supported?'模型默认值':'当前不可配置'} value={value??''} disabled={saving||!capability.supported} onChange={event=>{const text=event.target.value;setDraft(previous=>previous?{...previous,[field]:text===''?null:Number(text)}:previous);setNotice('');}} />}
          {!capability.supported&&value!==null&&<GlassButton disabled={saving} onClick={()=>setDraft(previous=>previous?{...previous,[field]:null}:previous)}>恢复模型默认值</GlassButton>}
          {capability.limits&&<small>{capability.limits.min} — {capability.limits.max}</small>}
        </div></div>;
      })}</div>
    </section>}
    <div className="qs-admin-save"><span role="status" className="qs-muted">{dirty?'有未保存修改':state?.policy.updatedAt?'上次更新：'+new Date(state.policy.updatedAt).toLocaleString():''}</span><GlassButton disabled={saving||loading} onClick={()=>{if(dirty)setPendingModel('__reload');else void load();}}><RotateCcw className="h-4 w-4" />重新载入</GlassButton><GlassButton disabled={!dirty||saving||loading} onClick={()=>void save()}><Save className="h-4 w-4" />{saving?'正在保存…':'保存设置'}</GlassButton></div>
    <p className="qs-muted">本页只影响教学助手，不改变 OCR 或作业评分。空值表示使用模型默认值。正在生成时更新配置，请等当前轮结束后再发送新消息。</p>
    {picker==='model'&&<ResponsiveChoiceDialog title="选择模型" value={selected} options={(state?.models??[]).map(item=>({value:generationKey(item.provider,item.id),label:item.name,description:item.provider}))} onClose={()=>setPicker(null)} onChange={key=>{setPicker(null);if(dirty&&key!==selected)setPendingModel(key);else choose(key);}} />}
    {picker==='reasoning'&&model&&<ResponsiveChoiceDialog title="推理强度" value={String(draft?.reasoningEffort??'')} options={[{value:'',label:'模型默认值'},...(model.capabilities.reasoningEffort.options??[]).map(value=>({value,label:effortLabels[value]??value}))]} onClose={()=>setPicker(null)} onChange={value=>{setPicker(null);setDraft(previous=>previous?{...previous,reasoningEffort:value||null}:previous);setNotice('');}} />}
    {pendingModel&&<ResponsiveDialog title="放弃未保存的参数？" onClose={()=>setPendingModel(null)}><p>当前修改还没有保存。</p><div className="flex flex-wrap justify-end gap-2"><GlassButton onClick={()=>setPendingModel(null)}>继续编辑</GlassButton><GlassButton variant="danger" onClick={()=>{if(pendingModel==='__reload'){setPendingModel(null);void load();}else choose(pendingModel);}}>放弃修改</GlassButton></div></ResponsiveDialog>}
  </div>;
}
