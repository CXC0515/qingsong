export default function ClassroomBatchScope({name,allScope,onChange,visibleCount,allCount,visibleEligible,allEligible,busy=false}:{
  name:string;allScope:boolean;onChange:(all:boolean)=>void;visibleCount:number;allCount:number;visibleEligible:number;allEligible:number;busy?:boolean;
}) {
  return <fieldset className="grid gap-2" disabled={busy}>
    <legend className="mb-2 text-sm font-semibold">本次批量范围</legend>
    {[{all:false,label:'当前筛选',count:visibleCount,eligible:visibleEligible},{all:true,label:'整个名册',count:allCount,eligible:allEligible}].map(option=><label key={String(option.all)} className={'flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm '+(allScope===option.all?'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30':'border-slate-200 dark:border-zinc-700')}>
      <input type="radio" name={name} checked={allScope===option.all} onChange={()=>onChange(option.all)}/>
      <span><strong>{option.label} · {option.count}人</strong><span className="mt-1 block text-slate-500">可填写 {option.eligible} 人，已有结果保留</span></span>
    </label>)}
  </fieldset>;
}
