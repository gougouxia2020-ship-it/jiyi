// 裁剪几何：按 alpha 阈值求「真实不透明像素」的包围盒与四边透明边。
//
// 核心判定：把 alpha >= ALPHA_SOLID 的像素视为「实体像素」，
// 低于该阈值的一律当作透明留白或烘焙软阴影（不计入包围盒）。
// 阈值取得较高（见常量说明），因此半透明软阴影、抗锯齿羽化边
// 都不会把包围盒撑大——这正是本 sprint 要解决的「阴影撑歪比例、
// 选中框比实物大一圈」的问题。

// 实体判定阈值：alpha ≥ 此值才算真实不透明像素。
// 实测 14 张图（见 receipt）alpha 直方图：实体主体几乎全为 255，
// 烘焙软阴影集中在 alpha ≤ ~180 的半透明区间；取 240 可干净剔除
// 阴影与羽化边，且不会误伤实体本体。
export const ALPHA_SOLID = 240;

// 裁剪后四周保留的呼吸边（px）。契约要求四边透明边 ≤8px，
// 取 6 既留出抗锯齿羽化边的观感余量，又稳妥地卡在 8 以内。
export const BREATH_PAD = 6;

// 契约硬指标：裁剪后四边透明边不得超过此值（px）。
export const MAX_TRANSPARENT_MARGIN = 8;

/**
 * 求实体像素包围盒（inclusive）。无任何实体像素时返回 null。
 * @param {{width:number,height:number,data:Uint8Array}} img
 * @param {number} threshold alpha 阈值
 * @returns {{left:number,top:number,right:number,bottom:number}|null}
 */
export function opaqueBounds(img, threshold = ALPHA_SOLID) {
  const { width, height, data } = img;
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const a = data[(row + x) * 4 + 3];
      if (a >= threshold) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  if (right < 0) return null;
  return { left, top, right, bottom };
}

/**
 * 四边透明边宽度（px）：从各边缘到最近实体像素之间的空白行/列数。
 * @returns {{top:number,right:number,bottom:number,left:number}|null}
 */
export function sideMargins(img, threshold = ALPHA_SOLID) {
  const b = opaqueBounds(img, threshold);
  if (!b) return null;
  return {
    top: b.top,
    left: b.left,
    right: img.width - 1 - b.right,
    bottom: img.height - 1 - b.bottom,
  };
}

/**
 * 实体宽高比 = 实体包围盒宽 / 高（不含呼吸边）。保留 4 位小数。
 */
export function entityAspectRatio(img, threshold = ALPHA_SOLID) {
  const b = opaqueBounds(img, threshold);
  if (!b) return null;
  const w = b.right - b.left + 1;
  const h = b.bottom - b.top + 1;
  return Math.round((w / h) * 10000) / 10000;
}
