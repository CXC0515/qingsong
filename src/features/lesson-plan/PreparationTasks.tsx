import { useEffect, useState } from "react";
import { Square } from "lucide-react";
import { GlassButton } from "../../components/glass/Glass";
import type { PreparationTask } from "../../domain/preparation";
import { cancelPreparationTask } from "../../services/preparationApi";

const labels: Record<PreparationTask["status"], string> = {
  queued: "排队中", running: "正在处理", "needs-input": "需要补充",
  completed: "已完成", cancelled: "已停止", failed: "未完成", interrupted: "已中断",
};
export default function PreparationTasks({preparationId,tasks,onChanged,onError}:{
  preparationId:string; tasks:PreparationTask[]; onChanged:()=>Promise<void>; onError:(message:string)=>void;
}) {
  const sorted=[...tasks].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  const active=sorted.find(task=>["queued","running","needs-input"].includes(task.status));
  const latestFailure=sorted.find(task=>["failed","interrupted"].includes(task.status));
  const failureKey=latestFailure ? latestFailure.id+":"+latestFailure.updatedAt : "";
  const [notice,setNotice]=useState("");
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
  if(!tasks.length)return null;
  return <div className="qs-prep-tasks">
    {active && <div className="qs-prep-current-task" role="status">
      <span title={active.message||active.instruction}>{labels[active.status]} · {active.stage||active.instruction}</span>
      {["queued","running"].includes(active.status) && <GlassButton onClick={()=>void stop(active)}><Square size={14}/>停止</GlassButton>}
    </div>}
    {!active && notice===failureKey && latestFailure && <div className="qs-prep-task-notice" role="status">
      <span>此前有任务未完成，已有教案保留。详情已收进任务记录。</span>
      <button type="button" aria-label="收起任务提示" onClick={()=>setNotice("")}>收起</button>
    </div>}
    <details className="qs-prep-task-history">
      <summary>任务记录 · {tasks.length}</summary>
      <ul>{sorted.map(task=><li key={task.id}>
        <div><strong>{labels[task.status]}</strong><time dateTime={task.updatedAt}>{new Date(task.updatedAt).toLocaleString("zh-CN",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})}</time></div>
        <p>{task.stage||task.instruction}</p>
        {task.message && <p>{task.message}</p>}
        {["queued","running"].includes(task.status) && <GlassButton onClick={()=>void stop(task)}><Square size={14}/>停止此任务</GlassButton>}
      </li>)}</ul>
    </details>
  </div>;
}
