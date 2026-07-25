// 念念 · 陈列室 —— 解码与规范化（U2-S1·上传管线上游）
//
// 职责：把用户选的原始图片文件解码 → EXIF 方向校正 → 长边降采样至 ≤ MAX_EDGE → 重编码压缩，
//  产出一张「规范化后的图」（NormalizedImage）交给下游【处理接口】。
//
// 全程用浏览器原生能力（createImageBitmap / canvas），不新增任何运行时依赖：
//  - EXIF 方向校正：createImageBitmap(file, { imageOrientation: 'from-image' }) 由浏览器按 EXIF 摆正，
//    返回的位图 width/height 即校正后的显示尺寸（竖拍不再躺倒），无需手解析 EXIF 字节。
//  - 降采样：按校正后长边缩放至 ≤ MAX_EDGE，drawImage 到目标尺寸的 canvas；原始满帧位图用完即刻 close 释放，
//    避免手机 48MP 直出（约 190MB）解码后长期驻留内存把标签页拖崩。
//  - 重编码压缩：canvas.toDataURL('image/jpeg', JPEG_QUALITY) 输出 data: URL（存储换血由 persistence 接手）。

import type { NormalizedImage } from './processor';

/** 降采样目标：规范化后长边像素上限。 */
export const MAX_EDGE = 1600;

/** 重编码 JPEG 质量（0–1）。 */
export const JPEG_QUALITY = 0.85;

/** 上传规范化失败：解码不了 / 环境不支持 createImageBitmap 等，均以本类型冒泡。 */
export class NormalizeError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'NormalizeError';
  }
}

/**
 * 解码 + EXIF 方向校正 + 长边降采样 + 重编码压缩。
 * @param file   用户选的图片文件（image/*）。
 * @param maxEdge 长边像素上限（默认 MAX_EDGE=1600）。
 */
export async function normalizeImage(file: Blob, maxEdge = MAX_EDGE): Promise<NormalizedImage> {
  if (typeof createImageBitmap !== 'function') {
    throw new NormalizeError('当前浏览器不支持图片解码（createImageBitmap 不可用）。');
  }

  // 解码并按 EXIF 摆正——一步到位拿到「校正后」的位图与尺寸（竖拍返回竖尺寸，不躺倒）。
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (err) {
    throw new NormalizeError('这张图片没能解码，换一张试试。', err);
  }

  try {
    const sw = bitmap.width;
    const sh = bitmap.height;
    if (sw <= 0 || sh <= 0) {
      throw new NormalizeError('图片尺寸无效。');
    }
    // 长边降采样：只缩不放（scale ≤ 1），长边压到 maxEdge 以内。
    const scale = Math.min(1, maxEdge / Math.max(sw, sh));
    const dw = Math.max(1, Math.round(sw * scale));
    const dh = Math.max(1, Math.round(sh * scale));

    const canvas = document.createElement('canvas');
    canvas.width = dw;
    canvas.height = dh;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new NormalizeError('无法创建绘图上下文（canvas 2d）。');
    }
    ctx.drawImage(bitmap, 0, 0, dw, dh);
    // 重编码压缩为 JPEG data: URL。
    const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    return { dataUrl, width: dw, height: dh };
  } finally {
    // 满帧原始位图用完即刻释放（内存安全的关键：48MP 直出不长期驻留）。
    bitmap.close();
  }
}
