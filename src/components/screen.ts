'use client';
export const width = 960,
  height = 640;
const markerColor = [250, 0, 170];
export function drawCode(ctx: CanvasRenderingContext2D, text: string, y: number) {
  const bits = text
    .replaceAll('-', '')
    .split('')
    .flatMap((c) => parseInt(c, 16).toString(2).padStart(4, '0').split(''));
  bits.forEach((bit, i) => {
    ctx.fillStyle = bit === '1' ? '#fff' : '#000';
    ctx.fillRect(32 + i * 6, y, 6, 8);
  });
}
function readCode(ctx: CanvasRenderingContext2D, y: number) {
  const image = ctx.getImageData(0, 0, width, height);
  let bits = '';
  for (let i = 0; i < 128; i++) {
    const p = ((y + 4) * width + 32 + i * 6 + 3) * 4;
    bits += image.data[p] > 128 ? '1' : '0';
  }
  return bits
    .match(/.{4}/g)!
    .map((x) => parseInt(x, 2).toString(16))
    .join('');
}
export function verifyAndMask(input: HTMLVideoElement | HTMLCanvasElement, marker: string) {
  const w = input instanceof HTMLVideoElement ? input.videoWidth : input.width,
    h = input instanceof HTMLVideoElement ? input.videoHeight : input.height;
  if (w < 960 || h < 640)
    throw new Error('Sandbox-Auflösung zu klein. Vollbild öffnen und Quelle erneut wählen.');
  const scratch = document.createElement('canvas');
  scratch.width = w;
  scratch.height = h;
  const c = scratch.getContext('2d', { willReadFrequently: true })!;
  c.drawImage(input, 0, 0);
  const pixels = c.getImageData(0, 0, w, h).data;
  let minX = w,
    minY = h,
    maxX = 0,
    maxY = 0;
  for (let y = 0; y < h; y += 2)
    for (let x = 0; x < w; x += 2) {
      const i = (y * w + x) * 4;
      if (
        Math.abs(pixels[i] - markerColor[0]) < 6 &&
        pixels[i + 1] < 6 &&
        Math.abs(pixels[i + 2] - markerColor[2]) < 6
      ) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  const cropW = maxX - minX + 2,
    cropH = maxY - minY + 2;
  if (cropW < 950 || cropH < 630 || Math.abs(cropW / cropH - 1.5) > 0.02)
    throw new Error('Kontrolliertes Sandbox-Layout nicht erkannt. Upload gestoppt.');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(scratch, minX, minY, cropW, cropH, 0, 0, width, height);
  if (readCode(ctx, 16) !== marker)
    throw new Error('Falsche Screenquelle oder Session-Marker. Upload gestoppt.');
  const hex = readCode(ctx, 32);
  const caseId = [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
  ctx.fillStyle = '#111c2b';
  ctx.fillRect(24, 520, 912, 80);
  ctx.fillStyle = '#fff';
  ctx.font = '20px sans-serif';
  ctx.fillText('Bankkonto lokal maskiert', 48, 560);
  return {
    base64: canvas.toDataURL('image/png').split(',')[1],
    caseId,
    geometry: [w, h, minX, minY, cropW, cropH].join(':'),
  };
}
export function drawAnchors(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#fa00aa';
  for (const [x, y] of [
    [0, 0],
    [952, 0],
    [0, 632],
    [952, 632],
  ])
    ctx.fillRect(x, y, 8, 8);
}
