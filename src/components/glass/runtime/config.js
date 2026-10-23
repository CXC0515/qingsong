// Approved material: experiment B, top-left light, reflection 80%.
// Clone per project; overrides do not modify these baseline values.
export const defaults = Object.freeze({
  preset: 'lens', theme: 'light', lightAngle: 225, reflection: 0.8,
  dispersion: 0, refraction: true, nativeRefraction: true,
  motion: Object.freeze({ mode: 'static', periodMs: 16000 })
});
export const presets = Object.freeze({
  lens: Object.freeze({ radius: 48, edgeWidth: 23, displacement: 16, blur: 0, rimWidth: 1.15 }),
  button: Object.freeze({ radius: 26, edgeWidth: 11, displacement: 6, blur: 1.25, rimWidth: .85 }),
  segmented: Object.freeze({ radius: 27, edgeWidth: 11, displacement: 6, blur: 1.25, rimWidth: .85 }),
  toolbar: Object.freeze({ radius: 28, edgeWidth: 12, displacement: 7, blur: 1.25, rimWidth: .85 })
});
