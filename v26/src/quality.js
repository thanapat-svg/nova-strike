// Graphics presets. Every field is actually consumed by the renderer / game.
export const PRESETS = {
  low:   {id: 'low',   name: 'LOW',   dprMax: 1,    dprMin: .6,  parts: 3000,  dust: 60,  stars: 600,  env: false, pbr: false, shadow: 0,    blob: false, nebOct: 1, bloom: 0, aa: false, trail: false, debris: 4,  burst: .45, lights: 1, grid: false},
  med:   {id: 'med',   name: 'MEDIUM', dprMax: 1.25, dprMin: .7,  parts: 9000,  dust: 120, stars: 1200, env: true,  pbr: true,  shadow: 0,    blob: true,  nebOct: 2, bloom: 1, aa: false, trail: true,  debris: 8,  burst: .75, lights: 2, grid: true},
  high:  {id: 'high',  name: 'HIGH',  dprMax: 1.75, dprMin: .8,  parts: 20000, dust: 200, stars: 2200, env: true,  pbr: true,  shadow: 0,    blob: true,  nebOct: 3, bloom: 2, aa: true,  trail: true,  debris: 14, burst: 1,   lights: 3, grid: true},
  ultra: {id: 'ultra', name: 'ULTRA', dprMax: 2.5,  dprMin: 1,   parts: 40000, dust: 320, stars: 3600, env: true,  pbr: true,  shadow: 1024, blob: false, nebOct: 4, bloom: 3, aa: true,  trail: true,  debris: 24, burst: 1.5, lights: 3, grid: true}
};
export const ORDER = ['low', 'med', 'high', 'ultra'];

export function detectAuto() {
  const c = navigator.hardwareConcurrency || 4, m = navigator.deviceMemory || 4;
  const touch = matchMedia('(pointer:coarse)').matches;
  if (!touch) return 'ultra';
  if (c <= 4 || m <= 2) return 'low';
  if (c <= 6 || m <= 3) return 'med';
  return 'high';
}
export const resolve = q => PRESETS[q] || PRESETS[detectAuto()];
