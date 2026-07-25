// 素材裁切校验脚本（N1 验收硬指标）。
//
// 逐张测量 items/ 下 14 张物件 PNG：
//   1) 按 alpha 阈值（忽略烘焙半透明软阴影）求真实不透明像素包围盒；
//   2) 校验四边透明边 ≤ MAX_TRANSPARENT_MARGIN(8px)；
//   3) 校验 src/assets/manifest.ts 里该物件的 aspectRatio 字段与
//      裁剪后图片的真实实体宽高比一致（容差 0.01）。
// 全部通过 exit 0，任一不达标 exit 1 并打印明细。
//
// 【S1 范围】本脚本只覆盖 14 张物件图。里程碑 N1 还要求校验「新横版
// 书房场景图存在且为横向」——该场景图由 S2 新增，其存在性/朝向校验
// 亦由 S2 在下方留出的挂载点补充；S1 阶段本脚本对 14 张物件图 exit 0 即达标。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG } from './lib/png.mjs';
import { opaqueBounds, sideMargins, entityAspectRatio, ALPHA_SOLID, MAX_TRANSPARENT_MARGIN } from './lib/trim.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ITEMS_DIR = path.join(ROOT, 'items');
const BACKGROUNDS_DIR = path.join(ROOT, 'backgrounds');
const MANIFEST = path.join(ROOT, 'src/assets/manifest.ts');

const AR_TOLERANCE = 0.01;

// N1-S2 新增的横版书房场景图（替换旧竖版、成为默认书房背景）。
const WIDE_READING_NOOK = 'reading-nook-wide-demo.jpg';

/**
 * 纯 Node 读取 JPEG 的像素宽高（解析 SOFn 帧头，不依赖任何外部库/工具）。
 * 与 lib/png.mjs 一样，评审环境无论是否 npm install 都能 `node` 直接跑通。
 * @param {Buffer} buf
 * @returns {{ width:number, height:number }}
 */
function jpegSize(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) {
    throw new Error('不是合法 JPEG（SOI 签名不符）');
  }
  let off = 2;
  while (off < buf.length) {
    if (buf[off] !== 0xff) {
      off++;
      continue;
    }
    let marker = buf[off + 1];
    // 跳过填充的连续 0xFF。
    while (marker === 0xff && off + 1 < buf.length) {
      off++;
      marker = buf[off + 1];
    }
    off += 2;
    // 无长度字段的独立标记：SOI/EOI/TEM/RSTn。
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }
    if (off + 2 > buf.length) break;
    const len = buf.readUInt16BE(off);
    // SOFn 帧头（C0–CF，除 C4=DHT / C8=JPG / CC=DAC）：段内 [len(2)][precision(1)][height(2)][width(2)]。
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const height = buf.readUInt16BE(off + 3);
      const width = buf.readUInt16BE(off + 5);
      return { width, height };
    }
    off += len;
  }
  throw new Error('未找到 SOFn 帧头，无法读取尺寸');
}

// 期望的 14 张物件图（id 与文件名 <id>.png 一一对应）。
const ITEM_IDS = [
  'bedroom-1', 'bedroom-2', 'bedroom-3', 'bedroom-4', 'bedroom-5', 'bedroom-6',
  'living-1', 'living-2', 'living-3', 'living-4', 'living-5', 'living-6', 'living-7', 'living-8',
];

/**
 * 从 manifest.ts 源码里抽取每个物件条目的 id → aspectRatio 映射。
 * check 脚本用纯 node 运行，无法 import 含 TS 语法与资源 import 的 .ts，
 * 故按源码逐条正则解析（每个 ITEMS 条目一行对象字面量）。
 */
function parseManifestAspect(src) {
  const map = new Map();
  // 匹配形如 { id: 'living-1', name: '…', imageSrc: …, thumbSrc: …, aspectRatio: 0.872 }
  const re = /\{[^}]*\bid:\s*'([^']+)'[^}]*\baspectRatio:\s*([0-9]+(?:\.[0-9]+)?)[^}]*\}/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    map.set(m[1], Number(m[2]));
  }
  return map;
}

function fail(msg) {
  console.error(`  ✗ ${msg}`);
}

const manifestSrc = fs.readFileSync(MANIFEST, 'utf8');
const aspectMap = parseManifestAspect(manifestSrc);

let ok = true;
console.log(`素材裁切校验（alpha 阈值=${ALPHA_SOLID}，四边透明边上限=${MAX_TRANSPARENT_MARGIN}px）\n`);
console.log(
  `${'file'.padEnd(15)} ${'canvas'.padEnd(9)} ${'margins(t,r,b,l)'.padEnd(18)} ${'entityAR'.padEnd(9)} ${'manifestAR'.padEnd(11)} result`
);

for (const id of ITEM_IDS) {
  const fp = path.join(ITEMS_DIR, `${id}.png`);
  if (!fs.existsSync(fp)) {
    fail(`${id}.png 不存在`);
    ok = false;
    continue;
  }
  let img;
  try {
    img = decodePNG(fs.readFileSync(fp));
  } catch (e) {
    fail(`${id}.png 解码失败：${e.message}`);
    ok = false;
    continue;
  }
  const bounds = opaqueBounds(img, ALPHA_SOLID);
  if (!bounds) {
    fail(`${id}.png 未检测到任何实体像素（alpha≥${ALPHA_SOLID}）`);
    ok = false;
    continue;
  }
  const m = sideMargins(img, ALPHA_SOLID);
  const entityAR = entityAspectRatio(img, ALPHA_SOLID);
  const manifestAR = aspectMap.get(id);

  const problems = [];
  for (const [side, val] of [['top', m.top], ['right', m.right], ['bottom', m.bottom], ['left', m.left]]) {
    if (val > MAX_TRANSPARENT_MARGIN) problems.push(`${side}边透明${val}px>${MAX_TRANSPARENT_MARGIN}`);
  }
  if (manifestAR === undefined) {
    problems.push('manifest 缺 aspectRatio');
  } else if (Math.abs(manifestAR - entityAR) > AR_TOLERANCE) {
    problems.push(`宽高比不符 manifest=${manifestAR} 实体=${entityAR}`);
  }

  const pass = problems.length === 0;
  if (!pass) ok = false;
  console.log(
    `${(id + '.png').padEnd(15)} ${(`${img.width}x${img.height}`).padEnd(9)} ${(`${m.top},${m.right},${m.bottom},${m.left}`).padEnd(18)} ${String(entityAR).padEnd(9)} ${String(manifestAR ?? '—').padEnd(11)} ${pass ? '✓' : '✗ ' + problems.join('；')}`
  );
}

// 校验 manifest 里被标注的物件数量与预期一致（防止漏标/多标）。
if (aspectMap.size !== ITEM_IDS.length) {
  fail(`manifest 中带 aspectRatio 的物件条目数=${aspectMap.size}，期望 ${ITEM_IDS.length}`);
  ok = false;
}

// ── 横版书房场景图校验（里程碑 N1：含新横版书房图存在且为横向）──────────────
// 校验 backgrounds/reading-nook-wide-demo.jpg：① 文件存在；② 横向（width > height）。
console.log('\n横版书房场景图校验（存在性 + 横向朝向）');
{
  const bgPath = path.join(BACKGROUNDS_DIR, WIDE_READING_NOOK);
  if (!fs.existsSync(bgPath)) {
    fail(`${WIDE_READING_NOOK} 不存在（应为默认书房背景的横版场景图）`);
    ok = false;
  } else {
    try {
      const { width, height } = jpegSize(fs.readFileSync(bgPath));
      const landscape = width > height;
      if (!landscape) ok = false;
      console.log(
        `${WIDE_READING_NOOK.padEnd(28)} ${`${width}x${height}`.padEnd(11)} ${landscape ? '✓ 横向' : `✗ 非横向（width=${width} ≤ height=${height}）`}`
      );
    } catch (e) {
      fail(`${WIDE_READING_NOOK} 读取尺寸失败：${e.message}`);
      ok = false;
    }
  }
}

console.log();
if (ok) {
  console.log(`✓ 全部 ${ITEM_IDS.length} 张物件图达标：四边透明边 ≤${MAX_TRANSPARENT_MARGIN}px、清单宽高比与实体一致；横版书房图存在且为横向。`);
  process.exit(0);
} else {
  console.error('✗ 存在不达标项，见上。');
  process.exit(1);
}
