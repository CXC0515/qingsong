import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import ResponsiveChoiceDialog from '../../components/ResponsiveChoiceDialog';

export default function RecordingRoundPicker({value,rounds,disabled,onChange}:{value:number;rounds:number[];disabled:boolean;onChange:(round:number)=>void}){
  const [open,setOpen]=useState(false);
  return <><button type="button" className="qs-round-trigger" aria-label={'切换检查轮次，当前第'+value+'轮'} aria-haspopup="dialog" aria-expanded={open} disabled={disabled} onClick={()=>setOpen(true)}>第{value}轮检查<ChevronDown aria-hidden="true" className="h-3.5 w-3.5"/></button>
    {open&&<ResponsiveChoiceDialog title="切换检查轮次" value={String(value)} options={rounds.map(round=>({value:String(round),label:'第'+round+'轮检查'}))} onChange={value=>{if(!disabled)onChange(Number(value));}} onClose={()=>setOpen(false)}/>}
  </>;
}
