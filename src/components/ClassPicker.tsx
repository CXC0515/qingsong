import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { SchoolClass } from '../domain/types';
import { GlassSurface } from './glass/Glass';
import ResponsiveChoiceDialog from './ResponsiveChoiceDialog';

export default function ClassPicker({ classes, value, onChange, allowAll = false, label = '选择班级', disabled=false }: { classes: SchoolClass[]; value: string; onChange: (id: string) => void; allowAll?: boolean; label?: string; disabled?:boolean }) {
  const [open, setOpen] = useState(false);
  return <>
    <GlassSurface className="qs-class-picker"><button type="button" disabled={disabled} aria-label={label} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}><span>{classes.find(item => item.id === value)?.name ?? (allowAll ? '全部班级' : '选择班级')}</span><ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0" /></button></GlassSurface>
    {open && <ResponsiveChoiceDialog title={label} value={value} options={[...(allowAll ? [{ value: '', label: '全部班级' }] : []), ...classes.map(item => ({ value: item.id, label: item.name }))]} onChange={onChange} onClose={() => setOpen(false)} />}
  </>;
}
