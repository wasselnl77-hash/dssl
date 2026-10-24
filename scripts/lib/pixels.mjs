/* pixels.mjs: look at what a browser actually drew.
 *   const img = decodePng(await page.screenshot({ clip }))
 *   px(img, 10, 20)            -> [r, g, b, a]
 *   stats(img, x, y, w, h)     -> { mean:[r,g,b], variance, lit, n }  (lit = pixels brighter than the floor)
 */
import { PNG } from 'pngjs';

export const decodePng = (buf) => PNG.sync.read(buf);

export const px = (img, x, y) => {
  const i = (Math.round(y) * img.width + Math.round(x)) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
};

/** colour distance (0..441) */
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export function stats(img, x0, y0, w, h, floor = 40) {
  let n = 0, lit = 0, sr = 0, sg = 0, sb = 0, ssq = 0;
  for (let y = y0; y < y0 + h && y < img.height; y++) for (let x = x0; x < x0 + w && x < img.width; x++) {
    const [r, g, b] = px(img, x, y);
    n++; sr += r; sg += g; sb += b;
    const l = (r + g + b) / 3;
    ssq += l * l;
    if (l > floor) lit++;
  }
  const mr = sr / n, mg = sg / n, mb = sb / n, ml = (mr + mg + mb) / 3;
  return { mean: [mr, mg, mb].map((v) => Math.round(v)), variance: ssq / n - ml * ml, lit, n };
}
