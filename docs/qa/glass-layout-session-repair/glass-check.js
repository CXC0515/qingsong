async page => {
 const check = async label => {
   const bad=await page.evaluate(()=>[...document.querySelectorAll('.lg-backdrop')].map(n=>{const h=n.parentElement;return {host:h.className,position:getComputedStyle(h).position,width:h.getBoundingClientRect().width,layer:n.getBoundingClientRect().width}}).filter(x=>x.width>0&&(x.position==='static'||x.layer>x.width+2)));
   if(bad.length)throw Error(label+JSON.stringify(bad));
   return label+': confined';
 };
 const results=[await check('edit')];
 await page.getByRole('button',{name:'向上轮换',exact:true}).click();
 results.push(await check('rotate'));
 await page.getByRole('button',{name:'取消',exact:true}).click();
 results.push(await check('cancel'));
 for(let i=0;i<3;i++){
   await page.getByRole('button',{name:'编辑座位',exact:true}).click();
   results.push(await check('repeat-edit-'+i));
   await page.getByRole('button',{name:i===2?'保存座位':'取消',exact:true}).click();
   results.push(await check('repeat-exit-'+i));
 }
 await page.evaluate(()=>document.documentElement.classList.toggle('dark'));
 results.push(await check('dark'));
 await page.evaluate(()=>document.documentElement.classList.toggle('dark'));
 results.push(await check('light'));
 const cleanup=await page.evaluate(async()=>{
   const {mountGlass}=await import('/src/components/glass/runtime/liquid-glass.js');
   const h=document.createElement('div');h.className='business lg-surface';h.style.cssText='position:fixed;width:100px;height:40px;--lg-blur:2px';h.innerHTML='<div class="lg-content">ownership probe</div>';document.body.append(h);
   const api=mountGlass(h,{nativeRefraction:false});
   h.className='business-new lg-surface';h.style.position='absolute';h.style.color='red';h.style.setProperty('--lg-radius','99px');h.setAttribute('data-lg-theme','business');api.destroy();
   const ok=h.className==='business-new lg-surface'&&h.style.position==='absolute'&&h.style.color==='red'&&h.style.getPropertyValue('--lg-radius')==='99px'&&h.style.getPropertyValue('--lg-blur')==='2px'&&h.getAttribute('data-lg-theme')==='business'&&!h.querySelector('.lg-backdrop');h.remove();return ok;
 });
 if(!cleanup)throw Error('destroy overwrote newer business state');
 console.log(JSON.stringify({results,cleanup}));
 await page.screenshot({path:'output/playwright/seats-fixed.png'});
}
