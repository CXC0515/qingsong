/* Original experimental implementation. Inspiration and source links: ../../references/material.md.
   No dependency. Attach NativeGlass to a dedicated, empty backdrop layer. */

  const NS = 'http://www.w3.org/2000/svg';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function field(x, y, w, h, radius, band, strength) {
    const r = Math.min(radius, w / 2, h / 2);
    const px = x - w / 2, py = y - h / 2;
    const qx = Math.abs(px) - w / 2 + r, qy = Math.abs(py) - h / 2 + r;
    const ox = Math.max(qx, 0), oy = Math.max(qy, 0), len = Math.hypot(ox, oy);
    const sd = Math.min(Math.max(qx, qy), 0) + len - r;
    let nx = 0, ny = 0;
    if (len > 0) { nx = ox / len * Math.sign(px); ny = oy / len * Math.sign(py); }
    else if (qx > qy) nx = Math.sign(px); else ny = Math.sign(py);
    const t = clamp(1 + sd / Math.max(band, 1), 0, 1);
    const edge = t * t * (3 - 2 * t);
    return { dx: -nx * edge * strength, dy: -ny * edge * strength, sd, edge };
  }
  export class NativeBackdrop {
    constructor(layer, options = {}) {
      this.layer = layer;
      this.options = { radius: 52, band: 26, strength: 20, blur: 0, dispersion: 0, ...options };
      this.id = 'glass-' + Math.random().toString(36).slice(2);
      this.svg = document.createElementNS(NS, 'svg');
      this.svg.setAttribute('width', '0'); this.svg.setAttribute('height', '0');
      this.svg.style.cssText = 'position:absolute;pointer-events:none';
      this.svg.innerHTML = `<defs><filter id="${this.id}" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feImage result="map" preserveAspectRatio="none"/><feComponentTransfer in="map" result="neutralMap"><feFuncR type="linear" slope="1" intercept="${-0.5 / 255}"/><feFuncG type="linear" slope="1" intercept="${-0.5 / 255}"/></feComponentTransfer><feDisplacementMap in="SourceGraphic" in2="neutralMap" xChannelSelector="R" yChannelSelector="G"/></filter></defs>`;
      document.body.append(this.svg);
      this.filter = this.svg.querySelector('filter'); this.image = this.svg.querySelector('feImage');
      this.displacement = this.svg.querySelector('feDisplacementMap');
      this.displacement.setAttribute('result','plain');
      const matrix=[
        '1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0',
        '0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0',
        '0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0'
      ];
      this.channels=matrix.map((values,i)=>{
        const shift=document.createElementNS(NS,'feDisplacementMap');
        for(const [k,v] of Object.entries({in:'SourceGraphic',in2:'neutralMap',xChannelSelector:'R',yChannelSelector:'G',result:'shift'+i}))shift.setAttribute(k,v);
        const color=document.createElementNS(NS,'feColorMatrix');
        for(const [k,v] of Object.entries({in:'shift'+i,type:'matrix',values,result:'channel'+i}))color.setAttribute(k,v);
        this.filter.append(shift,color);return shift;
      });
      const rg=document.createElementNS(NS,'feBlend');
      for(const [k,v] of Object.entries({in:'channel0',in2:'channel1',mode:'screen',result:'rg'}))rg.setAttribute(k,v);
      this.filter.append(rg);
      this.combine=document.createElementNS(NS,'feBlend');
      for(const [k,v] of Object.entries({in:'rg',in2:'channel2',mode:'screen'}))this.combine.setAttribute(k,v);
      this.filter.append(this.combine);
      this.observer = new ResizeObserver(() => this.render()); this.observer.observe(layer);
      this.render();
    }
    set(options) { Object.assign(this.options, options); this.render(); }
    render() {
      // Layout dimensions, never animated/transformed screen bounds.
      const w=parseFloat(getComputedStyle(this.layer).width),h=parseFloat(getComputedStyle(this.layer).height);
      if (!Number.isFinite(w)||!Number.isFinite(h)||!w||!h) return;
      const { radius, band, strength, blur, dispersion } = this.options;
      // Map resolution is bounded independently of screen DPR; no per-frame generation.
      const dpr = Math.min(devicePixelRatio || 1, 2), iw = Math.ceil(w * dpr), ih = Math.ceil(h * dpr);
      const key=[w,h,radius,band,strength,blur,dispersion,dpr].join(',');
      if(this.cacheKey===key)return;
      this.cacheKey=key;
      const c = document.createElement('canvas'); c.width = iw; c.height = ih;
      const ctx = c.getContext('2d'), data = ctx.createImageData(iw, ih), mask = ctx.createImageData(iw, ih);
      for (let y = 0; y < ih; y++) for (let x = 0; x < iw; x++) {
        const f = field((x + .5) * w / iw, (y + .5) * h / ih, w, h, radius, band, 1);
        const i = (y * iw + x) * 4;
        // Neutral 128 is corrected to exactly 0.5 by feComponentTransfer.
        data.data[i] = Math.round(128 + f.dx * 127); data.data[i + 1] = Math.round(128 + f.dy * 127);
        data.data[i + 2] = 128; data.data[i + 3] = 255;
        mask.data[i] = mask.data[i + 1] = mask.data[i + 2] = 255;
        mask.data[i + 3] = f.sd <= 0 ? Math.round(Math.min(1, f.edge * 8) * 255) : 0;
      }
      ctx.putImageData(data, 0, 0); this.mapURL = c.toDataURL();
      ctx.putImageData(mask, 0, 0);
      // Render only the edge, leaving the clear core as the untouched DOM.
      const maskImage = blur ? 'none' : `url(${c.toDataURL()})`;
      this.layer.style.maskImage = maskImage; this.layer.style.webkitMaskImage = maskImage;
      this.layer.style.maskSize = '100% 100%'; this.layer.style.webkitMaskSize = '100% 100%';
      const pad = Math.ceil(strength + dispersion + blur * 3 + 2);
      for (const [k, v] of Object.entries({ x: -pad, y: -pad, width: w + pad * 2, height: h + pad * 2 })) this.filter.setAttribute(k, v);
      for (const [k, v] of Object.entries({ x: 0, y: 0, width: w, height: h, href: this.mapURL })) this.image.setAttribute(k, v);
      this.displacement.setAttribute('scale', strength * 255 / 127);
      this.channels.forEach((channel,i)=>channel.setAttribute('scale',Math.max(0,strength+(i-1)*dispersion)*255/127));
      // With zero dispersion, the last primitive passes the ordinary sample through.
      this.combine.setAttribute('in',dispersion?'rg':'plain');
      this.combine.setAttribute('in2',dispersion?'channel2':'plain');
      this.combine.setAttribute('mode',dispersion?'screen':'normal');
      this.layer.style.backdropFilter = `url(#${this.id})${blur ? ` blur(${blur}px)` : ''}`;
      this.layer.style.webkitBackdropFilter = this.layer.style.backdropFilter;
    }
    destroy() { this.observer.disconnect(); this.svg.remove(); this.layer.style.backdropFilter = ''; this.layer.style.webkitBackdropFilter = ''; this.layer.style.maskImage = ''; this.layer.style.webkitMaskImage = ''; }
  }

