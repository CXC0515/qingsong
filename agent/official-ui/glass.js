(function(){
  const root='/api/assistant/official/assets/glass/';
  const script=document.createElement('script');
  script.type='module';
  const link=document.createElement('link');link.rel='stylesheet';link.href=root+'liquid-glass.css';document.head.append(link);
  script.textContent=`import {mountGlass} from '${root}liquid-glass.js';
    const mounted=new Map();
    const observe=()=>{
      mounted.forEach((glass,host)=>{if(!host.isConnected){glass.destroy();mounted.delete(host);}});
      document.querySelectorAll('[data-qs-glass-button]').forEach(host=>{
      if(mounted.has(host))return;
      const glass=mountGlass(host,{preset:'button',theme:document.documentElement.classList.contains('dark')?'dark':'light',lightAngle:225,reflection:1,nativeRefraction:false});
      mounted.set(host,glass);
      });
    };
    new MutationObserver(observe).observe(document.documentElement,{childList:true,subtree:true});
    observe();`;
  document.head.append(script);
})();
