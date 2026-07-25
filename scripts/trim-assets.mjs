// 一次性裁边工具：按 alpha 阈值识别 items/ 下 14 张物件 PNG 的
// 「真实不透明像素」包围盒，忽略烘焙的半透明软阴影/鬼影/反光，
// 四周保留 BREATH_PAD 呼吸边后裁剪，原地替换文件。
//
// 判定阈值与呼吸边定义见 scripts/lib/trim.mjs。
// 幂等：对已裁好的文件重复运行不会继续缩小（呼吸边被夹取到已有边界）。
//
// 用法：node scripts/trim-assets.mjs [--dry]
//   --dry 只测量打印、不写盘。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG, encodePNG, cropRGBA } from './lib/png.mjs';
import { opaqueBounds, ALPHA_SOLID, BREATH_PAD } from './lib/trim.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ITEMS_DIR = path.join(ROOT, 'items');

// 本 sprint 只处理这 14 张物件图（场景背景图不动）。
const ITEM_FILES = [
  'bedroom-1.png', 'bedroom-2.png', 'bedroom-3.png', 'bedroom-4.png',
  'bedroom-5.png', 'bedroom-6.png',
  'living-1.png', 'living-2.png', 'living-3.png', 'living-4.png',
  'living-5.png', 'living-6.png', 'living-7.png', 'living-8.png',
];

const dry = process.argv.includes('--dry');

let changed = 0;
for (const name of ITEM_FILES) {
  const fp = path.join(ITEMS_DIR, name);
  const img = decodePNG(fs.readFileSync(fp));
  const b = opaqueBounds(img, ALPHA_SOLID);
  if (!b) {
    console.error(`  ${name}: 未找到任何实体像素（alpha≥${ALPHA_SOLID}），跳过`);
    continue;
  }
  const left = Math.max(0, b.left - BREATH_PAD);
  const top = Math.max(0, b.top - BREATH_PAD);
  const right = Math.min(img.width - 1, b.right + BREATH_PAD);
  const bottom = Math.min(img.height - 1, b.bottom + BREATH_PAD);
  const w = right - left + 1;
  const h = bottom - top + 1;

  const noop = left === 0 && top === 0 && w === img.width && h === img.height;
  const cropped = cropRGBA(img, left, top, w, h);
  const entW = b.right - b.left + 1;
  const entH = b.bottom - b.top + 1;
  console.log(
    `${name.padEnd(15)} ${String(img.width).padStart(3)}x${String(img.height).padStart(3)} -> ${String(w).padStart(3)}x${String(h).padStart(3)}  实体 ${entW}x${entH} ar=${(entW / entH).toFixed(3)}  ${noop ? '(无需裁剪)' : ''}`
  );
  if (!dry) {
    fs.writeFileSync(fp, encodePNG(cropped));
    changed++;
  }
}
console.log(`\n${dry ? '[dry-run] ' : ''}处理 ${ITEM_FILES.length} 张，写盘 ${changed} 张。`);
