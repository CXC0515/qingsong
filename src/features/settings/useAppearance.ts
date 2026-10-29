import {useCallback,useSyncExternalStore} from 'react';
import {defaultTheme,readStoredTheme,themeOptions} from '../../domain/appearance';

const changed='qingsong-appearance-changed';
const subscribe=(notify:()=>void)=>{
  const storage=(event:StorageEvent)=>{if(event.key===null||event.key.startsWith('app-theme:'))notify();};
  window.addEventListener(changed,notify);
  window.addEventListener('storage',storage);
  return()=>{window.removeEventListener(changed,notify);window.removeEventListener('storage',storage);};
};
export function useAppearance(userId:string) {
  const snapshot=useCallback(()=>readStoredTheme(userId),[userId]);
  const theme=useSyncExternalStore(subscribe,snapshot,()=>defaultTheme);
  const setTheme=useCallback((next:string)=>{
    if(!themeOptions.some(option=>option.value===next))throw Error('INVALID_APPEARANCE');
    localStorage.setItem(`app-theme:${userId}`,next);
    window.dispatchEvent(new Event(changed));
  },[userId]);
  return [theme,setTheme] as const;
}
