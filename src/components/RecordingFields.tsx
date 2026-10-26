import { SearchField } from './WorkspaceUI';
import type { InputHTMLAttributes } from 'react';

/** The field frame owns focus and material; the native input owns editing. */
export function StudentSearch({className='',...props}:InputHTMLAttributes<HTMLInputElement>){
  return <SearchField className={className} aria-label="找学生" placeholder="找学生" {...props}/>;
}
export function RecordingDate(props:InputHTMLAttributes<HTMLInputElement>){
  return <label className="qs-record-date"><input {...props} type="date" aria-label={props['aria-label']??'记录日期'}/></label>;
}
export function RecordingNote({label,...props}:InputHTMLAttributes<HTMLInputElement>&{label:string}){
  return <label className="qs-note-field"><span>{label}</span><input {...props}/></label>;
}
