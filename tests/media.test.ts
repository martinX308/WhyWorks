import { it, expect } from 'vitest';
import sharp from 'sharp';
import { validateFrame } from '../src/adapters/frame';
const marker = '0123456789abcdef0123456789abcdef',
  caseHex = 'fedcba9876543210fedcba9876543210';
async function image() {
  const pixels = Buffer.alloc(960 * 640 * 3);
  const dot = (x: number, y: number, color: number[]) => {
    const offset = (y * 960 + x) * 3;
    color.forEach((c, i) => (pixels[offset + i] = c));
  };
  for (let y = 0; y < 640; y++) for (let x = 0; x < 960; x++) dot(x, y, [17, 28, 43]);
  for (const [x, y] of [
    [2, 2],
    [954, 2],
    [2, 634],
    [954, 634],
  ])
    dot(x, y, [250, 0, 170]);
  for (const [code, y] of [
    [marker, 16],
    [caseHex, 32],
  ] as const) {
    const bits = [...code].flatMap((c) => parseInt(c, 16).toString(2).padStart(4, '0').split(''));
    bits.forEach((b, i) => dot(35 + i * 6, y + 4, b === '1' ? [255, 255, 255] : [0, 0, 0]));
  }
  dot(50, 530, [255, 255, 255]);
  return (
    await sharp(pixels, { raw: { width: 960, height: 640, channels: 3 } })
      .png()
      .toBuffer()
  ).toString('base64');
}
it('Server prüft Marker/Layout und maskiert nochmals vor Speicherung/Cloud', async () => {
  const raw = await image(),
    safe = await validateFrame(raw, marker);
  expect(safe.caseId).toBe('fedcba98-7654-3210-fedc-ba9876543210');
  const decoded = await sharp(Buffer.from(safe.base64, 'base64')).raw().toBuffer();
  expect([...decoded.subarray((530 * 960 + 50) * 3, (530 * 960 + 50) * 3 + 3)]).toEqual([
    17, 28, 43,
  ]);
  await expect(validateFrame(raw, 'f'.repeat(32))).rejects.toThrow('anderen Session');
});
it('falsche Framegröße und fehlende Maskierung werden abgewiesen', async () => {
  const tiny = await sharp({ create: { width: 10, height: 10, channels: 3, background: 'black' } })
    .png()
    .toBuffer();
  await expect(validateFrame(tiny.toString('base64'), marker)).rejects.toThrow('Layout');
  const raw = await image(),
    pixels = await sharp(Buffer.from(raw, 'base64')).raw().toBuffer();
  pixels[(590 * 960 + 40) * 3] = 255;
  const broken = await sharp(pixels, { raw: { width: 960, height: 640, channels: 3 } })
    .png()
    .toBuffer();
  await expect(validateFrame(broken.toString('base64'), marker)).rejects.toThrow('Maskierung');
});
