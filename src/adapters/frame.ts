import sharp from 'sharp';
import { requireThat } from '../application/errors';
export async function validateFrame(base64: string, marker: string) {
  const image = sharp(Buffer.from(base64, 'base64'), {
    limitInputPixels: 960 * 640,
    failOn: 'warning',
  });
  const meta = await image.metadata();
  requireThat(
    meta.format === 'png' && meta.width === 960 && meta.height === 640,
    422,
    'layout',
    'Frame hat nicht das unterstützte Sandbox-Layout.',
  );
  const { data, info } = await image.removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixel = (x: number, y: number) =>
    data.subarray((y * 960 + x) * info.channels, (y * 960 + x) * info.channels + 3);
  for (const [x, y] of [
    [2, 2],
    [954, 2],
    [2, 634],
    [954, 634],
  ])
    requireThat(
      pixel(x, y).every((n, i) => Math.abs(n - [250, 0, 170][i]) < 6),
      422,
      'layout',
      'Sandbox-Anker fehlen.',
    );
  function code(y: number) {
    let bits = '';
    for (let i = 0; i < 128; i++) bits += pixel(35 + i * 6, y + 4)[0] > 128 ? '1' : '0';
    return bits
      .match(/.{4}/g)!
      .map((x) => parseInt(x, 2).toString(16))
      .join('');
  }
  requireThat(code(16) === marker, 422, 'marker', 'Frame stammt aus einer anderen Session.');
  for (const x of [40, 400, 900])
    requireThat(
      pixel(x, 590).every((n, i) => n === [17, 28, 43][i]),
      422,
      'mask',
      'Client-Maskierung nicht nachgewiesen.',
    );
  const hex = code(32),
    caseId = [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20),
    ].join('-');
  requireThat(!/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(caseId), 422, 'case', 'Kein gespeicherter Fall.');
  // Mask again on the server before persistence or any provider payload.
  for (let y = 520; y < 600; y++)
    for (let x = 24; x < 936; x++) {
      const offset = (y * 960 + x) * info.channels;
      data[offset] = 17;
      data[offset + 1] = 28;
      data[offset + 2] = 43;
    }
  const safe = await sharp(data, { raw: { width: 960, height: 640, channels: info.channels } })
    .png()
    .toBuffer();
  return { caseId, base64: safe.toString('base64') };
}
