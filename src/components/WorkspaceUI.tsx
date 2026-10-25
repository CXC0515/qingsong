import { Search } from 'lucide-react';
import type { InputHTMLAttributes, ReactNode } from 'react';

export function SearchField({className='',...props}:InputHTMLAttributes<HTMLInputElement>){
  return <label className={'qs-search-field '+className}><Search aria-hidden="true" className="h-4 w-4 shrink-0"/><input type="search" aria-label={props['aria-label']??props.placeholder??'搜索'} {...props}/></label>;
}
export function WorkspaceToolbar({children,label}:{children:ReactNode;label:string}){
  return <div className="qs-workspace-toolbar" role="group" aria-label={label}>{children}</div>;
}
export function EmptyState({title,description,action}:{title:string;description?:string;action?:ReactNode}){
  return <div className="qs-empty" role="status"><strong>{title}</strong>{description&&<p>{description}</p>}{action&&<div>{action}</div>}</div>;
}
