import { useEffect, useState } from "react";
import ResponsiveDialog from "../../components/ResponsiveDialog";
import { MessageSquare, Square, X } from "lucide-react";
import { GlassButton } from "../../components/glass/Glass";
import type { PreparationTask } from "../../domain/preparation";
import { cancelPreparationTask } from "../../services/preparationApi";

const labels: Record<PreparationTask["status"], string> = {
  queued: "排队中", running: "正在处理", "needs-input": "需要补充",
  completed: "已完成", cancelled: "已停止", failed: "未完成", interrupted: "已中断",
};
export default function PreparationTasks({preparationId,documentId,tasks,onChanged,onError}:{
  preparationId:string; documentId:string; tasks:PreparationTask[]; onChanged:()=>Promise<void>; onError:(message:string)=>void;
}) {
  const [open,setOpen]=useState(false);
  const sorted=[...tasks].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  const active=sorted.find(task=>["queued","running"].includes(task.status));
  const needsInput=sorted.find(task=>task.status==="needs-input");
  const latestFailure=sorted.find(task=>["failed","interrupted"].includes(task.status));
  const failureKey=latestFailure ? latestFailure.id+":"+latestFailure.updatedAt : "";
  const [notice,setNotice]=useState("");
  const [dismissedNeedsInput,setDismissedNeedsInput]=useState<string|null>(null);
  const showNeedsInput=Boolean(needsInput&&!active&&dismissedNeedsInput!==needsInput.id);
  const showFailure=Boolean(!active&&notice===failureKey&&latestFailure);
  useEffect(()=>{
    setNotice(failureKey);
    if(!failureKey)return;
    const timer=setTimeout(()=>setNotice(""),5000);
    return()=>clearTimeout(timer);
  },[failureKey]);
  const stop=async(task:PreparationTask)=>{
    try {
      const result=await cancelPreparationTask(preparationId,task.id);
      await onChanged();
      if(result.warning)onError(result.warning);
    }catch(cause){onError(cause instanceof Error?cause.message:"停止结果未确认，已有教案保留，请核对任务记录。");}
  };
  const continueTask=(task:PreparationTask)=>{
    setOpen(false);
    setDismissedNeedsInput(task.id);
    setNotice("");
    window.dispatchEvent(new CustomEvent("qingsong:preparation-assistant",{detail:{preparationId,documentId:task.documentId??documentId,...(task.sessionId?{sessionId:task.sessionId}:{})}}));
  };
  return <div className="qs-prep-tasks">
    {active && <div className="qs-prep-current-task" role="status">
      <span title={active.message||active.instruction}>{labels[active.status]} · {active.stage||active.instruction}</span>
      {["queued","running"].includes(active.status) && <GlassButton onClick={()=>void stop(active)}><Square size={14}/>停止</GlassButton>}
    </div>}
    {(showNeedsInput||showFailure) && <div className="qs-prep-task-alerts" role="status" aria-live="polite">
      {showNeedsInput && needsInput && <div className="qs-prep-task-alert qs-prep-needs-input">
        <span title={needsInput.message||needsInput.instruction}>需要补充 · {needsInput.message||needsInput.stage||needsInput.instruction}</span>
        <div className="qs-prep-task-alert-actions">
          <GlassButton onClick={()=>continueTask(needsInput)}><MessageSquare size={14}/>去助手补充</GlassButton>
          <button type="button" aria-label="收起补充提醒" onClick={()=>setDismissedNeedsInput(needsInput.id)}><X size={16}/></button>
        </div>
      </div>}
      {showFailure && <div className="qs-prep-task-alert">
        <span>此前有任务未完成，已有教案保留。详情已收进任务记录。</span>
        <button type="button" aria-label="收起任务提示" onClick={()=>setNotice("")}>收起</button>
      </div>}
    </div>}
    <GlassButton onClick={()=>setOpen(true)} aria-haspopup="dialog"><span>任务记录</span><span className="qs-prep-count"> · {tasks.length}</span></GlassButton>
    {open && <ResponsiveDialog title="任务记录" onClose={()=>setOpen(false)}>
      {!tasks.length && <p>暂无任务记录。</p>}
      <ul>{sorted.map(task=><li key={task.id}>
        <div><strong>{labels[task.status]}</strong><time dateTime={task.updatedAt}>{new Date(task.updatedAt).toLocaleString("zh-CN",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})}</time></div>
        <p>{task.stage||task.instruction}</p>
        {task.message && <p>{task.message}</p>}
        {task.status==="needs-input" && <GlassButton onClick={()=>continueTask(task)}><MessageSquare size={14}/>去助手补充</GlassButton>}
        {["queued","running"].includes(task.status) && <GlassButton onClick={()=>void stop(task)}><Square size={14}/>停止此任务</GlassButton>}
      </li>)}</ul>
    </ResponsiveDialog>}
  </div>;
}
