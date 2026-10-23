import { Search } from 'lucide-react';
import type { InputHTMLAttributes } from 'react';

/** The field frame owns focus and material; the native input owns editing. */
export function StudentSearch({className='',...props}:InputHTMLAttributes<HTMLInputElement>){
  return <label className={'qs-search-field '+className}><Search aria-hidden="true" className="h-4 w-4 shrink-0"/><input type="search" aria-label="找学生" placeholder="找学生" {...props}/></label>;
}
export function RecordingDate(props:InputHTMLAttributes<HTMLInputElement>){
  return <label className="qs-record-date"><input {...props} type="date" aria-label={props['aria-label']??'记录日期'}/></label>;
}
export function RecordingNote({label,...props}:InputHTMLAttributes<HTMLInputElement>&{label:string}){
  return <label className="qs-note-field"><span>{label}</span><input {...props}/></label>;
}
