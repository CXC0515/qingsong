// src/components/glass/runtime/native-backdrop.js
var NS = "http://www.w3.org/2000/svg";
var clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function field(x, y, w, h, radius, band, strength) {
  const r = Math.min(radius, w / 2, h / 2);
  const px = x - w / 2, py = y - h / 2;
  const qx = Math.abs(px) - w / 2 + r, qy = Math.abs(py) - h / 2 + r;
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0), len = Math.hypot(ox, oy);
  const sd = Math.min(Math.max(qx, qy), 0) + len - r;
  let nx = 0, ny = 0;
  if (len > 0) {
    nx = ox / len * Math.sign(px);
    ny = oy / len * Math.sign(py);
  } else if (qx > qy) nx = Math.sign(px);
  else ny = Math.sign(py);
  const t = clamp(1 + sd / Math.max(band, 1), 0, 1);
  const edge = t * t * (3 - 2 * t);
  return { dx: -nx * edge * strength, dy: -ny * edge * strength, sd, edge };
}
var NativeBackdrop = class {
  constructor(layer, options = {}) {
    this.layer = layer;
    this.options = { radius: 52, band: 26, strength: 20, blur: 0, dispersion: 0, ...options };
    this.id = "glass-" + Math.random().toString(36).slice(2);
    this.svg = document.createElementNS(NS, "svg");
    this.svg.setAttribute("width", "0");
    this.svg.setAttribute("height", "0");
    this.svg.style.cssText = "position:absolute;pointer-events:none";
    this.svg.innerHTML = `<defs><filter id="${this.id}" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feImage result="map" preserveAspectRatio="none"/><feComponentTransfer in="map" result="neutralMap"><feFuncR type="linear" slope="1" intercept="${-0.5 / 255}"/><feFuncG type="linear" slope="1" intercept="${-0.5 / 255}"/></feComponentTransfer><feDisplacementMap in="SourceGraphic" in2="neutralMap" xChannelSelector="R" yChannelSelector="G"/></filter></defs>`;
    document.body.append(this.svg);
    this.filter = this.svg.querySelector("filter");
    this.image = this.svg.querySelector("feImage");
    this.displacement = this.svg.querySelector("feDisplacementMap");
    this.displacement.setAttribute("result", "plain");
    const matrix = [
      "1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0",
      "0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0",
      "0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0"
    ];
    this.channels = matrix.map((values, i) => {
      const shift = document.createElementNS(NS, "feDisplacementMap");
      for (const [k, v] of Object.entries({ in: "SourceGraphic", in2: "neutralMap", xChannelSelector: "R", yChannelSelector: "G", result: "shift" + i })) shift.setAttribute(k, v);
      const color = document.createElementNS(NS, "feColorMatrix");
      for (const [k, v] of Object.entries({ in: "shift" + i, type: "matrix", values, result: "channel" + i })) color.setAttribute(k, v);
      this.filter.append(shift, color);
      return shift;
    });
    const rg = document.createElementNS(NS, "feBlend");
    for (const [k, v] of Object.entries({ in: "channel0", in2: "channel1", mode: "screen", result: "rg" })) rg.setAttribute(k, v);
    this.filter.append(rg);
    this.combine = document.createElementNS(NS, "feBlend");
    for (const [k, v] of Object.entries({ in: "rg", in2: "channel2", mode: "screen" })) this.combine.setAttribute(k, v);
    this.filter.append(this.combine);
    this.observer = new ResizeObserver(() => this.render());
    this.observer.observe(layer);
    this.render();
  }
  set(options) {
    Object.assign(this.options, options);
    this.render();
  }
  render() {
    const w = parseFloat(getComputedStyle(this.layer).width), h = parseFloat(getComputedStyle(this.layer).height);
    if (!Number.isFinite(w) || !Number.isFinite(h) || !w || !h) return;
    const { radius, band, strength, blur, dispersion } = this.options;
    const dpr = Math.min(devicePixelRatio || 1, 2), iw = Math.ceil(w * dpr), ih = Math.ceil(h * dpr);
    const key = [w, h, radius, band, strength, blur, dispersion, dpr].join(",");
    if (this.cacheKey === key) return;
    this.cacheKey = key;
    const c = document.createElement("canvas");
    c.width = iw;
    c.height = ih;
    const ctx = c.getContext("2d"), data = ctx.createImageData(iw, ih), mask = ctx.createImageData(iw, ih);
    for (let y = 0; y < ih; y++) for (let x = 0; x < iw; x++) {
      const f = field((x + 0.5) * w / iw, (y + 0.5) * h / ih, w, h, radius, band, 1);
      const i = (y * iw + x) * 4;
      data.data[i] = Math.round(128 + f.dx * 127);
      data.data[i + 1] = Math.round(128 + f.dy * 127);
      data.data[i + 2] = 128;
      data.data[i + 3] = 255;
      mask.data[i] = mask.data[i + 1] = mask.data[i + 2] = 255;
      mask.data[i + 3] = f.sd <= 0 ? Math.round(Math.min(1, f.edge * 8) * 255) : 0;
    }
    ctx.putImageData(data, 0, 0);
    this.mapURL = c.toDataURL();
    ctx.putImageData(mask, 0, 0);
    const maskImage = blur ? "none" : `url(${c.toDataURL()})`;
    this.layer.style.maskImage = maskImage;
    this.layer.style.webkitMaskImage = maskImage;
    this.layer.style.maskSize = "100% 100%";
    this.layer.style.webkitMaskSize = "100% 100%";
    const pad = Math.ceil(strength + dispersion + blur * 3 + 2);
    for (const [k, v] of Object.entries({ x: -pad, y: -pad, width: w + pad * 2, height: h + pad * 2 })) this.filter.setAttribute(k, v);
    for (const [k, v] of Object.entries({ x: 0, y: 0, width: w, height: h, href: this.mapURL })) this.image.setAttribute(k, v);
    this.displacement.setAttribute("scale", strength * 255 / 127);
    this.channels.forEach((channel, i) => channel.setAttribute("scale", Math.max(0, strength + (i - 1) * dispersion) * 255 / 127));
    this.combine.setAttribute("in", dispersion ? "rg" : "plain");
    this.combine.setAttribute("in2", dispersion ? "channel2" : "plain");
    this.combine.setAttribute("mode", dispersion ? "screen" : "normal");
    this.layer.style.backdropFilter = `url(#${this.id})${blur ? ` blur(${blur}px)` : ""}`;
    this.layer.style.webkitBackdropFilter = this.layer.style.backdropFilter;
  }
  destroy() {
    this.observer.disconnect();
    this.svg.remove();
    this.layer.style.backdropFilter = "";
    this.layer.style.webkitBackdropFilter = "";
    this.layer.style.maskImage = "";
    this.layer.style.webkitMaskImage = "";
  }
};

// src/components/glass/runtime/edge-light.js
var clamp2 = (v, a, b) => Math.max(a, Math.min(b, v));
var EdgeLight = class {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.cacheKey = "";
  }
  configure(width, height, radius, rimWidth) {
    const dpr = Math.min(devicePixelRatio || 1, 2), w = Math.round(width * dpr), h = Math.round(height * dpr);
    const r = Math.min(radius, width / 2, height / 2), key = [width, height, r, rimWidth, dpr].join(",");
    if (key === this.cacheKey || !w || !h) return;
    this.cacheKey = key;
    this.canvas.width = w;
    this.canvas.height = h;
    this.image = this.ctx.createImageData(w, h);
    this.edge = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const px = (x + 0.5) / dpr - width / 2, py = (y + 0.5) / dpr - height / 2;
      const qx = Math.abs(px) - width / 2 + r, qy = Math.abs(py) - height / 2 + r, ox = Math.max(qx, 0), oy = Math.max(qy, 0), len = Math.hypot(ox, oy);
      const d = -(Math.min(Math.max(qx, qy), 0) + len - r);
      if (d < 0 || d > 5) continue;
      const nx = len ? ox / len * Math.sign(px) : qx > qy ? Math.sign(px) : 0, ny = len ? oy / len * Math.sign(py) : qy >= qx ? Math.sign(py) : 0;
      const core = Math.exp(-Math.pow((d - 0.65) / rimWidth, 2) * 2.6), spread = Math.exp(-Math.pow(d / 2.1, 2) * 1.5), i = (y * w + x) * 4;
      this.image.data[i] = 250;
      this.image.data[i + 1] = 253;
      this.image.data[i + 2] = 242;
      this.edge.push({ i, nx, ny, core, spread });
    }
  }
  draw(angle, reflection, theme) {
    if (!this.image) return;
    const a = angle * Math.PI / 180, lx = Math.cos(a), ly = Math.sin(a), gain = reflection * (theme === "dark" ? 0.86 : 1);
    for (const e of this.edge) {
      const facing = e.nx * lx + e.ny * ly, primary = Math.pow(Math.max(0, facing), 3), bounce = Math.pow(Math.max(0, -facing), 5);
      const shine = (e.core * (0.025 + 0.68 * primary + 0.13 * bounce) + e.spread * 0.075 * primary) * gain;
      this.image.data[e.i + 3] = Math.round(clamp2(shine, 0, 0.8) * 255);
    }
    this.ctx.putImageData(this.image, 0, 0);
  }
};
var ChromaticRim = class extends EdgeLight {
  draw(angle, intensity, theme) {
    if (!this.image) return;
    const light = angle * Math.PI / 180;
    for (const e of this.edge) {
      const a = Math.atan2(e.ny, e.nx), curvature = Math.pow(Math.abs(2 * e.nx * e.ny), 0.65);
      const facing = Math.max(0, Math.cos(a - light));
      const spectrum = [0, 2.094, 4.189].map((phase) => Math.round(255 * (0.18 + 0.82 * Math.pow(0.5 + 0.5 * Math.cos(a * 2.5 + phase), 2))));
      this.image.data[e.i] = spectrum[0];
      this.image.data[e.i + 1] = spectrum[1];
      this.image.data[e.i + 2] = spectrum[2];
      this.image.data[e.i + 3] = Math.round(255 * clamp2((e.core * 0.65 + e.spread * 0.1) * curvature * (0.45 + 0.55 * facing) * intensity / 2, 0, 0.65));
    }
    this.ctx.putImageData(this.image, 0, 0);
  }
};

// src/components/glass/runtime/config.js
var defaults = Object.freeze({
  preset: "lens",
  theme: "light",
  lightAngle: 225,
  reflection: 0.8,
  dispersion: 0,
  refraction: true,
  nativeRefraction: true,
  motion: Object.freeze({ mode: "static", periodMs: 16e3 })
});
var presets = Object.freeze({
  lens: Object.freeze({ radius: 48, edgeWidth: 23, displacement: 16, blur: 0, rimWidth: 1.15 }),
  button: Object.freeze({ radius: 26, edgeWidth: 11, displacement: 6, blur: 1.25, rimWidth: 0.85 }),
  segmented: Object.freeze({ radius: 27, edgeWidth: 11, displacement: 6, blur: 1.25, rimWidth: 0.85 }),
  toolbar: Object.freeze({ radius: 28, edgeWidth: 12, displacement: 7, blur: 1.25, rimWidth: 0.85 })
});

// src/components/glass/runtime/liquid-glass.js
var active = /* @__PURE__ */ new WeakMap();
var clamp3 = (n, a, b) => Math.max(a, Math.min(b, n));
function normalize(input) {
  if (!presets[input.preset]) throw new TypeError("Unknown glass preset");
  if (!["light", "dark"].includes(input.theme)) throw new TypeError("theme must be light or dark");
  if (!["static", "orbit"].includes(input.motion.mode)) throw new TypeError("motion.mode must be static or orbit");
  const c = { ...presets[input.preset], ...input, motion: { ...input.motion } };
  for (const key of ["radius", "edgeWidth", "displacement", "blur", "rimWidth", "lightAngle", "reflection", "dispersion"]) if (!Number.isFinite(c[key])) throw new TypeError(key + " must be finite");
  c.radius = Math.max(0, c.radius);
  c.edgeWidth = Math.max(1, c.edgeWidth);
  c.displacement = Math.max(0, c.displacement);
  c.blur = Math.max(0, c.blur);
  c.rimWidth = Math.max(0.1, c.rimWidth);
  c.dispersion = clamp3(c.dispersion, 0, 5);
  c.reflection = clamp3(c.reflection, 0, 1);
  c.lightAngle = (c.lightAngle % 360 + 360) % 360;
  if (!Number.isFinite(c.motion.periodMs) || c.motion.periodMs < 1e3) throw new TypeError("motion.periodMs must be at least 1000");
  return c;
}
function mountGlass(host, options = {}) {
  if (active.has(host)) throw new Error("Glass already mounted on this element");
  const existing = host.querySelector(":scope > .lg-content");
  if (!existing) throw new Error("Provide one direct .lg-content child; business content stays outside filter layers");
  let input = { ...defaults, ...options, motion: { ...defaults.motion, ...options.motion } }, config = normalize(input);
  const saved = { class: host.getAttribute("class"), style: host.getAttribute("style"), theme: host.getAttribute("data-lg-theme"), profile: host.getAttribute("data-lg-profile"), fallback: host.getAttribute("data-lg-fallback") };
  const layer = document.createElement("div");
  layer.className = "lg-backdrop";
  layer.setAttribute("aria-hidden", "true");
  const canvas = document.createElement("canvas");
  canvas.className = "lg-light";
  canvas.setAttribute("aria-hidden", "true");
  const prism = document.createElement("canvas");
  prism.className = "lg-light lg-prism";
  prism.setAttribute("aria-hidden", "true");
  host.prepend(layer, canvas, prism);
  host.classList.add("lg-surface");
  const light = new EdgeLight(canvas), spectral = new ChromaticRim(prism);
  let native = null, raf = 0, visible = true, destroyed = false, lastTime = 0, phase = 0, lastDraw = 0;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  function draw() {
    light.draw(config.lightAngle + phase, config.reflection, config.theme);
    spectral.draw(config.lightAngle + phase, config.dispersion, config.theme);
  }
  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
    lastTime = 0;
  }
  function frame(t) {
    if (destroyed) return;
    if (lastTime) phase = (phase + (t - lastTime) * 360 / config.motion.periodMs) % 360;
    lastTime = t;
    if (t - lastDraw >= 1e3 / 30) {
      draw();
      lastDraw = t;
    }
    raf = requestAnimationFrame(frame);
  }
  function reconcile() {
    stop();
    if (config.motion.mode === "orbit" && !reduced.matches && visible && !document.hidden) raf = requestAnimationFrame(frame);
    else {
      if (reduced.matches || config.motion.mode === "static") phase = 0;
      draw();
    }
  }
  function geometry() {
    if (destroyed) return;
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    host.style.setProperty("--lg-radius", Math.min(config.radius, w / 2, h / 2) + "px");
    host.style.setProperty("--lg-blur", config.blur + "px");
    light.configure(w, h, config.radius, config.rimWidth);
    spectral.configure(w, h, config.radius, config.rimWidth);
    draw();
  }
  function material() {
    host.dataset.lgTheme = config.theme;
    host.dataset.lgProfile = config.blur === 0 ? "clear" : "control";
    const nativeOptions = { radius: config.radius, band: config.edgeWidth, strength: config.refraction ? config.displacement : 0, blur: config.blur, dispersion: config.refraction ? config.dispersion : 0 };
    const enabled = config.nativeRefraction && "backdropFilter" in layer.style;
    host.dataset.lgFallback = String(!enabled);
    if (enabled) {
      if (native) native.set(nativeOptions);
      else native = new NativeBackdrop(layer, nativeOptions);
    } else {
      if (native) {
        native.destroy();
        native = null;
      }
      layer.style.backdropFilter = `blur(${config.blur}px)`;
      layer.style.webkitBackdropFilter = layer.style.backdropFilter;
    }
    geometry();
  }
  const observer = new ResizeObserver(geometry);
  observer.observe(host);
  const intersection = new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    reconcile();
  });
  intersection.observe(host);
  reduced.addEventListener("change", reconcile);
  document.addEventListener("visibilitychange", reconcile);
  material();
  reconcile();
  const api = {
    update(patch) {
      if (destroyed) throw new Error("Glass was destroyed");
      const nextInput = { ...input, ...patch, motion: { ...input.motion, ...patch.motion } };
      const next = normalize(nextInput), optical = ["preset", "radius", "edgeWidth", "displacement", "blur", "rimWidth", "refraction", "nativeRefraction", "theme", "dispersion"].some((k) => next[k] !== config[k]);
      input = nextInput;
      config = next;
      if (patch.lightAngle !== void 0 || patch.motion?.mode === "static") phase = 0;
      if (optical) material();
      else draw();
      reconcile();
    },
    getConfig() {
      return { ...config, motion: { ...config.motion } };
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      stop();
      observer.disconnect();
      intersection.disconnect();
      reduced.removeEventListener("change", reconcile);
      document.removeEventListener("visibilitychange", reconcile);
      native?.destroy();
      layer.remove();
      canvas.remove();
      prism.remove();
      active.delete(host);
      for (const [key, attr] of Object.entries({ class: "class", style: "style", theme: "data-lg-theme", profile: "data-lg-profile", fallback: "data-lg-fallback" })) {
        if (saved[key] === null) host.removeAttribute(attr);
        else host.setAttribute(attr, saved[key]);
      }
    }
  };
  active.set(host, api);
  return api;
}

// src/components/glass/runtime/segmented.js
function mountSegmented(root, options = {}) {
  function motionConfig(input) {
    const c = { transition: "soft", durationMs: 380, response90Ms: 155, stretch: 0.045, bulge: 0.12, liftPx: 0, overshootPx: 0, ...input };
    if (!["soft", "slide"].includes(c.transition)) throw new TypeError("transition must be soft or slide");
    for (const k of ["durationMs", "response90Ms", "stretch", "bulge", "liftPx", "overshootPx"]) if (!Number.isFinite(c[k]) || c[k] < 0) throw new TypeError(k + " must be finite and nonnegative");
    return c;
  }
  let motion = motionConfig(Object.fromEntries(["transition", "durationMs", "response90Ms", "stretch", "bulge", "liftPx", "overshootPx"].filter((k) => options[k] !== void 0).map((k) => [k, options[k]])));
  const buttons = [...root.querySelectorAll("[data-value]")];
  if (!buttons.length) throw new Error("Provide buttons with unique data-value");
  const values = buttons.map((b) => b.dataset.value);
  if (new Set(values).size !== values.length) throw new Error("Segment values must be unique");
  let value = options.value ?? values[0];
  if (!values.includes(value)) throw new Error("Unknown segment value");
  const indicator = document.createElement("div");
  indicator.className = "lg-indicator";
  indicator.setAttribute("aria-hidden", "true");
  indicator.innerHTML = '<div class="lg-content"></div>';
  root.prepend(indicator);
  root.classList.add("lg-segmented");
  const saved = buttons.map((b) => ({ pressed: b.getAttribute("aria-pressed"), tab: b.getAttribute("tabindex") }));
  const material = mountGlass(indicator, { preset: "segmented", radius: 999, edgeWidth: 7, displacement: 3, blur: 0.7, dispersion: 1.35, ...options.glass });
  let rimConfig = { lightAngle: 225, reflection: 0.8, theme: "dark", ...options.glass };
  const rimCanvas = options.trackRim ? document.createElement("canvas") : null;
  const rim = rimCanvas ? new EdgeLight(rimCanvas) : null;
  if (rimCanvas) {
    rimCanvas.className = "lg-light lg-track-light";
    rimCanvas.setAttribute("aria-hidden", "true");
    root.prepend(rimCanvas);
    root.classList.add("lg-track-rim");
  }
  function drawRim() {
    if (rim) {
      rim.configure(root.clientWidth, root.clientHeight, 999, 1.05);
      rim.draw(rimConfig.lightAngle, rimConfig.reflection, rimConfig.theme);
    }
  }
  const prism = indicator.querySelector(".lg-prism");
  let prismAnimation = null;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  let animation = null, destroyed = false, trajectory = null;
  function move(animate) {
    const button2 = buttons[values.indexOf(value)], rr = root.getBoundingClientRect(), br = button2.getBoundingClientRect();
    if (!rr.width || !br.width) return;
    const old = indicator.getBoundingClientRect(), x = br.left - rr.left - root.clientLeft, y = br.top - rr.top - root.clientTop;
    const fromWidth = old.width || br.width;
    const fromX = old.left - rr.left - root.clientLeft + (fromWidth - br.width) / 2;
    let initialVelocity = 0;
    if (animate && trajectory && animation?.playState === "running") {
      const t = Math.max(0, Number(animation.currentTime) || 0) / 1e3;
      const { a, v, w } = trajectory;
      initialVelocity = (v - w * (v + w * a) * t) * Math.exp(-w * t);
    }
    animation?.cancel();
    prismAnimation?.cancel();
    trajectory = null;
    indicator.style.width = br.width + "px";
    indicator.style.height = br.height + "px";
    indicator.style.top = y + "px";
    indicator.style.transform = `translateX(${x}px)`;
    buttons.forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.value === value));
      b.tabIndex = b.dataset.value === value ? 0 : -1;
    });
    if (animate && !reduce.matches && Math.abs(fromX - x) > 0.5) {
      const travel = x - fromX, duration = Math.max(motion.durationMs, motion.response90Ms * 2.5), T = Math.max(1e-3, duration / 1e3);
      const fromScaleY = old.height / br.height || 1;
      const bulge = motion.liftPx > 0 ? Math.max(motion.bulge, (root.clientHeight + 2 * motion.liftPx) / br.height - 1) : motion.bulge;
      const smooth = (t) => {
        const n = Math.max(0, Math.min(1, t));
        return n * n * (3 - 2 * n);
      };
      const w = 3.889 / Math.max(1e-3, motion.response90Ms / 1e3);
      const response = (t) => 1 - (1 + w * t) * Math.exp(-w * t), end = response(T);
      const frames = [], prismFrames = [];
      const a = fromX - x, v = motion.transition === "soft" ? initialVelocity : 0;
      trajectory = { a, v, w };
      for (let i = 0; i <= 40; i++) {
        const u = i / 40, t = u * T, p = i === 40 ? 1 : response(t) / end;
        const shapeProgress = Math.min(1, t / Math.max(1e-3, motion.durationMs / 1e3));
        const tail = 1 - smooth((shapeProgress - 0.75) / 0.25);
        const shapeTime = shapeProgress * 0.26;
        const pulse = (1 - Math.exp(-180 * shapeTime)) * Math.exp(-15 * shapeTime) * Math.sin(2 * Math.PI * 4.2 * shapeTime) * tail;
        const stretch = shapeTime / 0.045 * Math.exp(1 - shapeTime / 0.045) * tail;
        const liquid = motion.transition === "soft";
        const sx = fromWidth / br.width + (1 - fromWidth / br.width) * p + (liquid ? motion.stretch * stretch : 0);
        const baseY = fromScaleY + (1 - fromScaleY) * p, wave = 2.1 * pulse;
        const sy = baseY + (liquid ? wave >= 0 ? Math.max(0, 1 + bulge - baseY) * Math.min(1, wave) : bulge * wave * 0.3 : 0);
        const over = Math.sign(travel) * motion.overshootPx * pulse;
        const position = i === 40 ? x : x + (a + (v + w * a) * t) * Math.exp(-w * t);
        prismFrames.push({ opacity: 0.3 + (liquid ? 0.7 * Math.min(1, Math.max(0, wave)) : 0), offset: u });
        frames.push({ transform: `translateX(${position + over}px) scale(${sx},${sy})`, offset: u });
      }
      animation = indicator.animate(frames, { duration, easing: "linear" });
      prismAnimation = prism?.animate(prismFrames, { duration, easing: "linear" });
    }
  }
  function select(next, { animate = true, notify = true } = {}) {
    if (destroyed) return;
    if (!values.includes(next)) throw new Error("Unknown segment value");
    if (next === value) return;
    value = next;
    move(animate);
    if (notify) options.onChange?.(value);
  }
  const click = (e) => {
    const b = e.target.closest("[data-value]");
    if (buttons.includes(b)) select(b.dataset.value);
  };
  const key = (e) => {
    const current2 = buttons.indexOf(e.target);
    if (current2 < 0) return;
    const direction = getComputedStyle(root).direction === "rtl" ? -1 : 1;
    let n = current2;
    if (e.key === "ArrowRight") n = (current2 + direction + buttons.length) % buttons.length;
    else if (e.key === "ArrowLeft") n = (current2 - direction + buttons.length) % buttons.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = buttons.length - 1;
    else return;
    e.preventDefault();
    buttons[n].focus();
    select(values[n]);
  };
  const reducedChanged = () => {
    if (reduce.matches) {
      animation?.cancel();
      move(false);
    }
  };
  root.addEventListener("click", click);
  root.addEventListener("keydown", key);
  reduce.addEventListener("change", reducedChanged);
  let geometryKey = "";
  const observer = new ResizeObserver(() => {
    const key2 = [root.clientWidth, root.clientHeight, ...buttons.flatMap((b) => [b.offsetLeft, b.offsetTop, b.offsetWidth, b.offsetHeight])].join(",");
    if (key2 !== geometryKey) {
      geometryKey = key2;
      drawRim();
      move(false);
    }
  });
  observer.observe(root);
  buttons.forEach((b) => observer.observe(b));
  move(false);
  return {
    select,
    getValue: () => value,
    updateGlass(patch) {
      material.update(patch);
      rimConfig = { ...rimConfig, ...patch };
      drawRim();
    },
    updateMotion(patch) {
      motion = motionConfig({ ...motion, ...patch });
      animation?.cancel();
      move(false);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      animation?.cancel();
      observer.disconnect();
      reduce.removeEventListener("change", reducedChanged);
      root.removeEventListener("click", click);
      root.removeEventListener("keydown", key);
      prismAnimation?.cancel();
      rimCanvas?.remove();
      if (rimCanvas) root.classList.remove("lg-track-rim");
      material.destroy();
      indicator.remove();
      root.classList.remove("lg-segmented");
      buttons.forEach((b, i) => {
        for (const [key2, attr] of [["pressed", "aria-pressed"], ["tab", "tabindex"]]) saved[i][key2] === null ? b.removeAttribute(attr) : b.setAttribute(attr, saved[i][key2]);
      });
    }
  };
}

// docs/prototypes/assistant-settings/main.js
var $ = (s) => document.querySelector(s);
var paths = { settings: '<path d="m9.7 4.3.5-2h3.6l.5 2 1.8 1 2-.6 1.8 3.1-1.5 1.5v2.1l1.5 1.5-1.8 3.1-2-.6-1.8 1-.5 2h-3.6l-.5-2-1.8-1-2 .6L2.2 13l1.5-1.5V9.4L2.2 7.9 4 4.8l2 .6z" transform="translate(1 2)"/><circle cx="12" cy="12" r="3"/>', "panel-left": '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 3v18"/>', x: '<path d="m6 6 12 12M6 18 18 6"/>', plus: '<path d="M12 5v14M5 12h14"/>', chevron: '<path d="m9 6 6 6-6 6"/>', more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>', search: '<circle cx="10.8" cy="10.8" r="7"/><path d="m16 16 4.5 4.5"/>', "arrow-up": '<path d="M12 19V5m-6 6 6-6 6 6"/>', sliders: '<path d="M4 7h8m4 0h4M4 17h3m4 0h9"/><circle cx="14" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>', rules: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>', memory: '<path d="M6 3h12v18l-6-4-6 4z"/>' };
var icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.settings}</svg>`;
var esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
var materials = /* @__PURE__ */ new Map();
function disposeWithin(root) {
  for (const [host, api] of materials) {
    if (root.contains(host)) {
      api.destroy();
      materials.delete(host);
    }
  }
}
function hydrate(root = document) {
  root.querySelectorAll("[data-icon]").forEach((el) => {
    el.innerHTML = icon(el.dataset.icon);
    el.removeAttribute("data-icon");
  });
  root.querySelectorAll(".material").forEach((el) => {
    if (!materials.has(el)) materials.set(el, mountGlass(el, { preset: "button", radius: 16, theme: "light", lightAngle: 225, reflection: 1 }));
  });
}
var records = [
  { id: 1, kind: "rules", content: "\u6559\u6848\u5148\u5217\u6559\u5B66\u76EE\u6807\uFF0C\u518D\u5217\u6559\u5B66\u8FC7\u7A0B\uFF1B\u8BFE\u5802\u6D3B\u52A8\u7ED9\u51FA\u5177\u4F53\u7684\u6559\u5E08\u63D0\u95EE\u3002", status: "active", updated: "\u4ECA\u5929", source: "\u672C\u4EBA\u6DFB\u52A0", expiry: "" },
  { id: 2, kind: "rules", content: "\u56DE\u7B54\u5C3D\u91CF\u7B80\u6D01\uFF0C\u7528\u4E2D\u6587\u8BF4\u660E\uFF1B\u4E0D\u786E\u5B9A\u7684\u5B66\u751F\u60C5\u51B5\u5148\u67E5\u8BB0\u5F55\u3002", status: "active", updated: "\u6628\u5929", source: "\u672C\u4EBA\u6DFB\u52A0", expiry: "" },
  { id: 3, kind: "rules", content: "\u8BFE\u5802\u5EFA\u8BAE\u4F18\u5148\u8003\u8651\u56DB\u5341\u5206\u949F\u5185\u80FD\u591F\u5B8C\u6210\u7684\u5B89\u6392\u3002", status: "disabled", updated: "10\u670825\u65E5", source: "\u672C\u4EBA\u6DFB\u52A0", expiry: "" },
  { id: 4, kind: "memory", content: "\u8FD9\u5B66\u671F\u60F3\u91CD\u70B9\u6539\u5584\u8BFE\u5802\u8BA8\u8BBA\u7684\u53C2\u4E0E\u5EA6\u3002", status: "active", updated: "\u4ECA\u5929", source: "\u8BFE\u5802\u8BA8\u8BBA\u600E\u4E48\u7EC4\u7EC7 \xB7 \u4ECA\u5929", expiry: "" },
  { id: 5, kind: "memory", content: "\u5907\u8BFE\u65F6\u4E60\u60EF\u5148\u6574\u7406\u5355\u5143\u76EE\u6807\uFF0C\u518D\u5B89\u6392\u6BCF\u8282\u8BFE\u7684\u6D3B\u52A8\u3002", status: "active", updated: "\u6628\u5929", source: "\u5907\u8BFE\u601D\u8DEF \xB7 \u6628\u5929", expiry: "" },
  { id: 6, kind: "memory", content: "\u5E0C\u671B\u6BCF\u5468\u7559\u51FA\u4E00\u6B21\u8BFE\u540E\u53CD\u601D\u7684\u65F6\u95F4\u3002", status: "active", updated: "10\u670825\u65E5", source: "\u672C\u4EBA\u6DFB\u52A0", expiry: "" },
  { id: 7, kind: "memory", content: "\u4ECA\u540E\u7684\u8BFE\u5802\u8BA8\u8BBA\uFF0C\u4F18\u5148\u5C1D\u8BD5\u5148\u72EC\u7ACB\u601D\u8003\u3001\u518D\u5C0F\u7EC4\u4EA4\u6D41\u3002", status: "candidate", updated: "\u4ECA\u5929", source: "\u8BFE\u5802\u8BA8\u8BBA\u600E\u4E48\u7EC4\u7EC7 \xB7 \u4ECA\u5929", expiry: "" },
  { id: 8, kind: "memory", content: "\u5E0C\u671B\u6559\u6848\u4E2D\u7684\u8BFE\u5802\u6D3B\u52A8\u9644\u4E0A\u9884\u8BA1\u7528\u65F6\u3002", status: "candidate", updated: "\u6628\u5929", source: "\u4E03\u5E74\u7EA7\u7684\u5907\u8BFE\u601D\u8DEF \xB7 \u6628\u5929", expiry: "" }
];
var section = "rules";
var memoryFilter = "saved";
var query = "";
var current = null;
var initial = "";
var initialExpiry = "";
var toastTimer;
var confirmAction;
var metrics = { human: 70, auto: 90, score: 75 };
var content = $("#settings-content");
var button = (id, label, primary = false) => `<button id="${id}" class="material ${primary ? "primary" : ""}" type="button"><span class="lg-content">${label}</span></button>`;
function heading(title, description, action = "") {
  return `<header class="page-heading"><div><span class="eyebrow">AI \u52A9\u624B</span><h2>${title}</h2><p>${description}</p></div>${action}</header>`;
}
function toast(text) {
  clearTimeout(toastTimer);
  $("#toast").textContent = text;
  $("#toast").hidden = false;
  toastTimer = setTimeout(() => $("#toast").hidden = true, 3200);
}
function renderLinks() {
  const data = [["metrics", "sliders", "OCR \u4E0E\u8BC4\u5206"], ["rules", "rules", "\u4E2A\u4EBA\u89C4\u5219"], ["memory", "memory", "\u957F\u671F\u8BB0\u5FC6"]];
  $("#settings-links").innerHTML = data.map(([id, i, label]) => `<button class="settings-link" data-section="${id}" ${section === id ? 'aria-current="page"' : ""}>${icon(i)}${label}</button>`).join("");
  $("#settings-links").querySelectorAll("button").forEach((b) => b.onclick = () => {
    section = b.dataset.section;
    query = "";
    renderSettings();
  });
}
function rows() {
  const selected = records.filter((r) => r.kind === section && r.status !== "deleted" && (section !== "memory" || (memoryFilter === "pending" ? r.status === "candidate" : r.status !== "candidate")) && r.content.includes(query));
  return selected.length ? selected.map((r) => `<button class="record-row" data-record="${r.id}" aria-label="\u67E5\u770B${esc(r.content)}"><span class="row-copy"><span class="row-title">${esc(r.content)}</span><span class="row-subtitle"><span class="row-status ${r.status === "candidate" ? "pending" : ""}">${{ active: "\u5DF2\u542F\u7528", disabled: "\u5DF2\u505C\u7528", candidate: "\u5F85\u786E\u8BA4" }[r.status]}</span><span>${r.updated}${r.source === "\u672C\u4EBA\u6DFB\u52A0" ? " \xB7 \u672C\u4EBA\u6DFB\u52A0" : ""}</span></span></span>${icon("chevron")}</button>`).join("") : '<p class="empty">\u6CA1\u6709\u7B26\u5408\u6761\u4EF6\u7684\u8BB0\u5F55\u3002</p>';
}
function wireRows() {
  content.querySelectorAll("[data-record]").forEach((b) => b.onclick = () => openEntry(records.find((r) => r.id === Number(b.dataset.record))));
}
function renderSettings() {
  disposeWithin(content);
  renderLinks();
  if (section === "metrics") renderMetrics();
  else if (section === "rules") {
    content.innerHTML = heading("\u4E2A\u4EBA\u89C4\u5219", "\u544A\u8BC9\u52A9\u624B\uFF0C\u4F60\u4E60\u60EF\u600E\u6837\u5DE5\u4F5C\u3002", button("new-entry", icon("plus") + "\u65B0\u589E", true)) + `<div class="row-list">${rows()}</div><p class="footnote">\u89C4\u5219\u7528\u4E8E\u540E\u7EED\u5BF9\u8BDD\u7684\u9ED8\u8BA4\u5DE5\u4F5C\u65B9\u5F0F\u3002\u672C\u6B21\u5BF9\u8BDD\u4E2D\u7684\u660E\u786E\u8981\u6C42\u4F18\u5148\u3002</p>`;
    $("#new-entry").onclick = () => openEntry(null);
  } else {
    const count = records.filter((r) => r.kind === "memory" && r.status === "candidate").length;
    content.innerHTML = heading("\u957F\u671F\u8BB0\u5FC6", "\u67E5\u770B\u548C\u6574\u7406\u4F60\u786E\u8BA4\u4FDD\u5B58\u7684\u80CC\u666F\u3002", button("new-entry", icon("plus") + "\u65B0\u589E", true)) + (count && memoryFilter === "saved" ? `<div class="review-line"><span>${count} \u6761\u8BB0\u5FC6\u5F85\u4F60\u786E\u8BA4</span><button id="review-pending">\u53BB\u67E5\u770B ${icon("chevron")}</button></div>` : "") + `<div class="memory-tools"><div class="segment-wrap"><div id="memory-segments"><button data-value="saved">\u5DF2\u4FDD\u5B58</button><button data-value="pending">\u5F85\u786E\u8BA4${count ? " \xB7 " + count : ""}</button></div></div><label class="search">${icon("search")}<input id="search-memory" type="search" aria-label="\u641C\u7D22\u8BB0\u5FC6" placeholder="\u641C\u7D22\u8BB0\u5FC6" value="${esc(query)}"></label></div><div class="row-list" id="memory-list">${rows()}</div><p class="footnote">\u53EA\u4FDD\u7559\u4F60\u5E0C\u671B\u52A9\u624B\u8BB0\u4F4F\u7684\u5185\u5BB9\u3002\u672A\u786E\u8BA4\u7684\u5EFA\u8BAE\u4E0D\u4F1A\u4F5C\u4E3A\u8BB0\u5FC6\u4F7F\u7528\u3002</p>`;
    const host = $("#memory-segments");
    materials.set(host, mountSegmented(host, { value: memoryFilter, trackRim: false, liftPx: 2, glass: { theme: "light", lightAngle: 225, reflection: 1 }, onChange: (value) => {
      memoryFilter = value;
      query = "";
      renderSettings();
    } }));
    $("#new-entry").onclick = () => openEntry(null);
    if ($("#review-pending")) $("#review-pending").onclick = () => {
      memoryFilter = "pending";
      renderSettings();
    };
    $("#search-memory").oninput = (e) => {
      query = e.target.value;
      $("#memory-list").innerHTML = rows();
      wireRows();
    };
  }
  hydrate(content);
  wireRows();
}
function control(key, title, value, min, max, step = 1) {
  return `<div class="metric-control ${key === "score" ? "solo" : ""}"><label for="metric-${key}">${title}<output id="output-${key}" for="metric-${key}">${value}<small>%</small></output></label><input id="metric-${key}" type="range" value="${value}" min="${min}" max="${max}" step="${step}"></div>`;
}
function renderMetrics() {
  content.innerHTML = heading("OCR \u4E0E\u8BC4\u5206", "\u4FDD\u7559\u8BC6\u522B\u8D28\u91CF\u548C\u8BC4\u5206\u7F6E\u4FE1\u5EA6\u7684\u8C03\u8282\u5165\u53E3\u3002") + `<section class="metric-group"><h3>\u56FE\u50CF\u4E0E OCR \u8D28\u68C0</h3><p>\u8C03\u6574\u8BC6\u522B\u8D28\u91CF\u7684\u53C2\u8003\u9608\u503C\u3002</p><div class="metric-controls">${control("human", "\u4EBA\u5DE5\u590D\u6838\u9608\u503C", metrics.human, 50, 80, 5)}${control("auto", "\u81EA\u52A8\u901A\u8FC7\u9608\u503C", metrics.auto, 75, 98)}</div></section><section class="metric-group"><h3>AI \u8BC4\u5206\u7F6E\u4FE1\u5EA6</h3><p>\u67E5\u770B\u8BC4\u5206\u7ED3\u679C\u65F6\u4F7F\u7528\u7684\u7F6E\u4FE1\u5EA6\u53C2\u8003\u3002</p><div class="metric-controls">${control("score", "\u8BC4\u5206\u7F6E\u4FE1\u5EA6\u9608\u503C", metrics.score, 50, 95, 5)}</div></section><div class="metric-actions">${button("save-metrics", "\u4FDD\u5B58\u8BBE\u7F6E", true)}</div><p class="footnote">\u539F\u578B\u53EA\u6F14\u793A\u9608\u503C\u5C55\u793A\u4E0E\u8C03\u8282\u3002\u6B63\u5F0F\u63A5\u5165\u524D\u9700\u786E\u8BA4\u6BCF\u4E2A\u6307\u6807\u7684\u5B9E\u9645\u4F5C\u7528\u548C\u4FDD\u5B58\u8303\u56F4\uFF0C\u4E0D\u5C06\u9875\u9762\u8C03\u8282\u7B49\u540C\u4E8E\u81EA\u52A8\u590D\u6838\u7B56\u7565\u751F\u6548\u3002</p>`;
  for (const key of ["human", "auto", "score"]) $("#metric-" + key).oninput = (e) => {
    let value = Number(e.target.value);
    if (key === "human") value = Math.min(value, Number($("#metric-auto").value) - 5);
    if (key === "auto") value = Math.max(value, Number($("#metric-human").value) + 5);
    e.target.value = value;
    $("#output-" + key).innerHTML = value + "<small>%</small>";
  };
  $("#save-metrics").onclick = () => {
    for (const key of ["human", "auto", "score"]) metrics[key] = Number($("#metric-" + key).value);
    toast("\u6F14\u793A\uFF1A\u9608\u503C\u5DF2\u4FDD\u5B58\uFF0C\u672A\u6539\u53D8\u771F\u5B9E\u6279\u6539\u8BBE\u7F6E\u3002");
  };
}
function confirm(title, body, action, label = "\u786E\u8BA4") {
  $("#confirm-title").textContent = title;
  $("#confirm-body").textContent = body;
  $("#confirm-yes .lg-content").textContent = label;
  confirmAction = action;
  $("#confirm-dialog").showModal();
}
function dirty() {
  return $("#entry-content").value !== initial || $("#entry-expiry").value !== initialExpiry;
}
function closeEntry() {
  if (dirty()) confirm("\u653E\u5F03\u672A\u4FDD\u5B58\u7684\u4FEE\u6539\uFF1F", "\u672C\u6B21\u586B\u5199\u5C1A\u672A\u4FDD\u5B58\u3002", () => $("#entry-dialog").close(), "\u653E\u5F03\u4FEE\u6539");
  else $("#entry-dialog").close();
}
function openEntry(record) {
  current = record;
  initial = record?.content ?? "";
  initialExpiry = record?.expiry ?? "";
  const kind = record?.kind ?? section;
  const pending = record?.status === "candidate";
  $("#dialog-category").textContent = kind === "rules" ? "\u4E2A\u4EBA\u89C4\u5219" : "\u957F\u671F\u8BB0\u5FC6";
  $("#dialog-title").textContent = pending ? "\u786E\u8BA4\u8FD9\u6761\u8BB0\u5FC6" : record ? "\u7F16\u8F91\u5185\u5BB9" : kind === "rules" ? "\u65B0\u589E\u4E2A\u4EBA\u89C4\u5219" : "\u65B0\u589E\u8BB0\u5FC6";
  $("#content-label").textContent = pending ? "\u62DF\u4FDD\u5B58\u7684\u5185\u5BB9" : "\u5185\u5BB9";
  $("#entry-content").value = initial;
  $("#entry-content").placeholder = kind === "rules" ? "\u4F8B\u5982\uFF1A\u6559\u6848\u5148\u5217\u6559\u5B66\u76EE\u6807\uFF0C\u518D\u5217\u6559\u5B66\u8FC7\u7A0B\u3002" : "\u4F8B\u5982\uFF1A\u8FD9\u5B66\u671F\u91CD\u70B9\u6539\u5584\u8BFE\u5802\u8BA8\u8BBA\u53C2\u4E0E\u5EA6\u3002";
  $("#entry-expiry").value = initialExpiry;
  $("#entry-meta").textContent = pending ? "\u786E\u8BA4\u524D\uFF0C\u4F60\u53EF\u4EE5\u5148\u8C03\u6574\u8FD9\u6BB5\u5185\u5BB9\u3002" : record ? "\u5F53\u524D" + (record.status === "active" ? "\u5DF2\u542F\u7528" : "\u5DF2\u505C\u7528") + " \xB7 \u66F4\u65B0\u4E8E" + record.updated : "\u4FDD\u5B58\u540E\u7528\u4E8E\u540E\u7EED\u52A9\u624B\u8BF7\u6C42\u3002";
  $("#entry-source").textContent = "\u6765\u6E90\uFF1A" + (record?.source ?? "\u672C\u4EBA\u6DFB\u52A0");
  $("#save-entry .lg-content").textContent = pending ? "\u786E\u8BA4\u4FDD\u5B58" : record ? "\u4FDD\u5B58\u4FEE\u6539" : "\u4FDD\u5B58";
  $("#more-entry").hidden = !record;
  $("#more-menu").hidden = true;
  $("#more-entry").setAttribute("aria-expanded", "false");
  $("#toggle-entry").textContent = pending ? "\u6682\u4E0D\u4FDD\u5B58" : record?.status === "disabled" ? "\u542F\u7528\u8FD9\u6761\u8BB0\u5F55" : "\u505C\u7528\u8FD9\u6761\u8BB0\u5F55";
  $("#history-panel").hidden = true;
  $("#entry-dialog").querySelector("details").open = pending;
  $("#entry-dialog").showModal();
  hydrate($("#entry-dialog"));
}
$("#entry-form").onsubmit = (e) => {
  e.preventDefault();
  const text = $("#entry-content").value.trim();
  if (!text) {
    $("#entry-content").focus();
    return;
  }
  const pending = current?.status === "candidate";
  if (current) {
    current.content = text;
    current.expiry = $("#entry-expiry").value;
    current.updated = "\u521A\u521A";
    if (pending) current.status = "active";
  } else records.push({ id: Date.now(), kind: section, content: text, expiry: $("#entry-expiry").value, status: "active", updated: "\u521A\u521A", source: "\u672C\u4EBA\u6DFB\u52A0" });
  $("#entry-dialog").close();
  renderSettings();
  toast(pending ? "\u6F14\u793A\uFF1A\u8BB0\u5FC6\u5DF2\u786E\u8BA4\u4FDD\u5B58\u3002" : "\u6F14\u793A\uFF1A\u5DF2\u4FDD\u5B58\uFF0C\u672A\u6539\u52A8\u771F\u5B9E\u8BB0\u5F55\u3002");
};
$("#close-entry").onclick = closeEntry;
$("#entry-dialog").oncancel = (e) => {
  e.preventDefault();
  closeEntry();
};
$("#more-entry").onclick = () => {
  $("#more-menu").hidden = !$("#more-menu").hidden;
  $("#more-entry").setAttribute("aria-expanded", String(!$("#more-menu").hidden));
};
$("#history-entry").onclick = () => {
  $("#history-panel").hidden = false;
  $("#history-panel").textContent = "\u4FEE\u6539\u8BB0\u5F55\u793A\u4F8B\uFF1A\u4ECA\u5929\u4FDD\u5B58\u5F53\u524D\u5185\u5BB9\u3002\u5B9E\u9645\u5E94\u7528\u4E2D\u5C06\u5728\u8FD9\u91CC\u67E5\u770B\u5386\u53F2\u7248\u672C\u548C\u539F\u59CB\u6765\u6E90\u3002";
  $("#more-menu").hidden = true;
};
$("#toggle-entry").onclick = () => {
  if (dirty()) {
    toast("\u8BF7\u5148\u4FDD\u5B58\u6216\u53D6\u6D88\u5F53\u524D\u4FEE\u6539\u3002");
    return;
  }
  if (current.status === "candidate") {
    confirm("\u6682\u4E0D\u4FDD\u5B58\u8FD9\u6761\u8BB0\u5FC6\uFF1F", "\u8FD9\u6761\u5EFA\u8BAE\u4E0D\u4F1A\u4F5C\u4E3A\u957F\u671F\u8BB0\u5FC6\u4F7F\u7528\u3002", () => {
      current.status = "deleted";
      $("#entry-dialog").close();
      renderSettings();
      toast("\u6F14\u793A\uFF1A\u5DF2\u5FFD\u7565\u8FD9\u6761\u5EFA\u8BAE\u3002");
    }, "\u6682\u4E0D\u4FDD\u5B58");
    return;
  }
  current.status = current.status === "active" ? "disabled" : "active";
  $("#entry-dialog").close();
  renderSettings();
  toast("\u6F14\u793A\uFF1A\u5DF2" + (current.status === "active" ? "\u542F\u7528" : "\u505C\u7528") + "\u3002");
};
$("#delete-entry").onclick = () => confirm("\u5220\u9664\u8FD9\u6761\u8BB0\u5F55\uFF1F", "\u540E\u7EED\u4E0D\u518D\u53EC\u56DE\u8FD9\u6761\u5185\u5BB9\uFF0C\u539F\u5BF9\u8BDD\u548C\u5386\u53F2\u7248\u672C\u4ECD\u4FDD\u7559\u3002", () => {
  current.status = "deleted";
  $("#entry-dialog").close();
  renderSettings();
  toast("\u6F14\u793A\uFF1A\u8BB0\u5F55\u5DF2\u5220\u9664\u3002");
}, "\u5220\u9664");
$("#confirm-cancel").onclick = () => $("#confirm-dialog").close();
$("#confirm-yes").onclick = () => {
  $("#confirm-dialog").close();
  confirmAction?.();
};
function scene(name) {
  const chat = name === "chat";
  $("#settings-scene").hidden = chat;
  $("#chat-scene").hidden = !chat;
  $("#breadcrumb").textContent = chat ? "\u5DE5\u4F5C\u53F0 / AI \u52A9\u624B" : "\u6211\u7684\u8BBE\u7F6E / AI \u52A9\u624B";
  $("#return-chat").hidden = chat;
  document.querySelectorAll("[data-scene]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.scene === name)));
}
document.querySelectorAll("[data-scene]").forEach((b) => b.onclick = () => scene(b.dataset.scene));
$("#return-chat").onclick = () => scene("chat");
$("#sidebar-settings").onclick = () => {
  section = "rules";
  renderSettings();
  scene("settings");
};
function collapse(value) {
  $("#chat-sidebar").hidden = value;
  $("#expand-sidebar").hidden = !value;
  $("#chat-scene").classList.toggle("sidebar-collapsed", value);
}
$("#collapse-sidebar").onclick = () => collapse(true);
$("#expand-sidebar").onclick = () => collapse(false);
$("#phone-toggle").onclick = () => {
  const enabled = $("#preview").classList.toggle("phone");
  $("#phone-toggle").setAttribute("aria-pressed", String(enabled));
  document.body.dataset.phone = String(enabled);
};
$("#send-demo").onclick = () => toast("\u8FD9\u662F\u5165\u53E3\u4F4D\u7F6E\u539F\u578B\uFF0C\u4E0D\u53D1\u9001\u6D88\u606F\u6216\u8C03\u7528\u6A21\u578B\u3002");
$(".new-chat .lg-content").innerHTML = icon("plus") + "\u65B0\u5BF9\u8BDD";
renderSettings();
hydrate();
window.addEventListener("beforeunload", () => {
  for (const api of materials.values()) api.destroy();
});
