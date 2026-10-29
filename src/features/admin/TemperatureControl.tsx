import {GlassButton, GlassSurface} from '../../components/glass/Glass';

export default function TemperatureControl({value, disabled, onChange}: {
  value:number|null; disabled:boolean; onChange:(value:number|null)=>void;
}) {
  // This neutral starting position does not represent the supplier's default.
  // The saved value remains null until the administrator chooses a number.
  const position=value===null||!Number.isFinite(value)?1:Math.min(2,Math.max(0,value));
  const fraction=position/2;
  return <div className="qs-temperature" data-disabled={disabled}>
    <div className="qs-temperature-controls">
      <div className="qs-temperature-slider" data-default={value===null}>
        <GlassSurface preset="button" className="qs-temperature-track" aria-hidden="true"><span className="qs-temperature-fill" style={{width:value===null?'0%':`${fraction*100}%`}}/></GlassSurface>
        <GlassSurface preset="button" className="qs-temperature-thumb" aria-hidden="true" style={{left:`${fraction*100}%`,transform:`translateX(${-fraction*28}px)`}}><span/></GlassSurface>
        <input type="range" aria-label="拖动调节温度" aria-valuetext={value===null?'模型默认值，拖动后使用自定义温度':String(value)} min={0} max={2} step={0.1} value={position} disabled={disabled} onChange={event=>onChange(Number(event.target.value))} onPointerUp={event=>{if(value===null&&!disabled)onChange(Number(event.currentTarget.value));}}/>
      </div>
      <input id="generation-temperature" className="qs-field-input" aria-label="温度数值" type="number" inputMode="decimal" min={0} max={2} step={0.1} placeholder="默认" value={value??''} disabled={disabled} onChange={event=>onChange(event.target.value===''?null:Number(event.target.value))}/>
    </div>
    <div className="qs-temperature-footer"><small>{value===null?'模型默认值':'0 — 2'}</small><GlassButton variant="ghost" disabled={disabled||value===null} onClick={()=>onChange(null)}>使用模型默认值</GlassButton></div>
  </div>;
}
