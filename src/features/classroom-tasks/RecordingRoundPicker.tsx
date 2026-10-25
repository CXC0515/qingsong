import { ChevronDown } from 'lucide-react';
import { useState, useSyncExternalStore, type ComponentProps } from 'react';
import { createPortal } from 'react-dom';
import ResponsiveChoiceDialog from '../../components/ResponsiveChoiceDialog';

export default function RecordingRoundPicker({value,rounds,disabled,onChange,noun='检查'}:{value:number;rounds:number[];disabled:boolean;onChange:(round:number)=>void;noun?:string}){
  const [open,setOpen]=useState(false);
  return <><button type="button" className="qs-round-trigger" aria-label={'切换'+noun+'轮次，当前第'+value+'轮'} aria-haspopup="dialog" aria-expanded={open} disabled={disabled} onClick={()=>setOpen(true)}>第{value}轮{noun}<ChevronDown aria-hidden="true" className="h-3.5 w-3.5"/></button>
    {open&&<ResponsiveChoiceDialog title={'切换'+noun+'轮次'} value={String(value)} options={rounds.map(round=>({value:String(round),label:'第'+round+'轮'+noun}))} onChange={value=>{if(!disabled)onChange(Number(value));}} onClose={()=>setOpen(false)}/>}
  </>;
}

const compactSnapshot=()=>window.matchMedia('(max-width:639px)').matches;
const subscribeCompact=(notify:()=>void)=>{const media=window.matchMedia('(max-width:639px)');media.addEventListener('change',notify);return ()=>media.removeEventListener('change',notify);};
/** One control moves to the action row on phones; its business state stays in the caller. */
export function RecordingRoundControls({target,...props}:ComponentProps<typeof RecordingRoundPicker>&{target?:HTMLElement|null}){
  const compact=useSyncExternalStore(subscribeCompact,compactSnapshot,()=>false);
  return compact?<RecordingRoundPicker {...props}/>:target?createPortal(<RecordingRoundPicker {...props}/>,target):null;
}
