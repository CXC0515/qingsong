const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
// Same rounded-rectangle distance and normal as the refraction field.
export class EdgeLight {
  constructor(canvas) { this.canvas=canvas; this.ctx=canvas.getContext('2d'); this.cacheKey=''; }
  configure(width,height,radius,rimWidth) {
    const dpr=Math.min(devicePixelRatio||1,2),w=Math.round(width*dpr),h=Math.round(height*dpr);
    const r=Math.min(radius,width/2,height/2),key=[width,height,r,rimWidth,dpr].join(',');
    if(key===this.cacheKey||!w||!h)return;
    this.cacheKey=key;this.canvas.width=w;this.canvas.height=h;
    this.image=this.ctx.createImageData(w,h);this.edge=[];
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const px=(x+.5)/dpr-width/2,py=(y+.5)/dpr-height/2;
      const qx=Math.abs(px)-width/2+r,qy=Math.abs(py)-height/2+r,ox=Math.max(qx,0),oy=Math.max(qy,0),len=Math.hypot(ox,oy);
      const d=-(Math.min(Math.max(qx,qy),0)+len-r);
      if(d<0||d>5)continue;
      const nx=len?ox/len*Math.sign(px):qx>qy?Math.sign(px):0,ny=len?oy/len*Math.sign(py):qy>=qx?Math.sign(py):0;
      const core=Math.exp(-Math.pow((d-.65)/rimWidth,2)*2.6),spread=Math.exp(-Math.pow(d/2.1,2)*1.5),i=(y*w+x)*4;
      this.image.data[i]=250;this.image.data[i+1]=253;this.image.data[i+2]=242;
      this.edge.push({i,nx,ny,core,spread});
    }
  }
  draw(angle,reflection,theme) {
    if(!this.image)return;
    const a=angle*Math.PI/180,lx=Math.cos(a),ly=Math.sin(a),gain=reflection*(theme==='dark'?.86:1);
    for(const e of this.edge){
      const facing=e.nx*lx+e.ny*ly,primary=Math.pow(Math.max(0,facing),3),bounce=Math.pow(Math.max(0,-facing),5);
      const shine=(e.core*(.025+.68*primary+.13*bounce)+e.spread*.075*primary)*gain;
      this.image.data[e.i+3]=Math.round(clamp(shine,0,.8)*255);
    }
    this.ctx.putImageData(this.image,0,0);
  }
}

// Local spectral reflection on curved shoulders; straight edges stay neutral.
// Background color separation is handled by NativeBackdrop, not painted here.
export class ChromaticRim extends EdgeLight {
  draw(angle,intensity,theme){
    if(!this.image)return;
    const light=angle*Math.PI/180;
    for(const e of this.edge){
      const a=Math.atan2(e.ny,e.nx),curvature=Math.pow(Math.abs(2*e.nx*e.ny),.65);
      const facing=Math.max(0,Math.cos(a-light));
      const spectrum=[0,2.094,4.189].map(phase=>Math.round(255*(.18+.82*Math.pow(.5+.5*Math.cos(a*2.5+phase),2))));
      this.image.data[e.i]=spectrum[0];this.image.data[e.i+1]=spectrum[1];this.image.data[e.i+2]=spectrum[2];
      this.image.data[e.i+3]=Math.round(255*clamp((e.core*.65+e.spread*.10)*curvature*(.45+.55*facing)*intensity/2,0,.65));
    }
    this.ctx.putImageData(this.image,0,0);
  }
}
