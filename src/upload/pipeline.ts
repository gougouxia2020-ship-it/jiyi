// 念念 · 陈列室 —— 上传管线主链路（U2-S1）
//
// dock「＋」→ 选图 → 【本模块】：解码与规范化(normalize) → 【处理接口】(processor) → 测宽高比 → 交预览。
// 预览确认后由上层 dispatch add-item 入库（本模块只产出一份可入库的 UploadResult，不碰 state / 存储 / UI）。
//
// 【处理接口】以第二参注入，默认 defaultProcessor（本期恒等直通）：
//  - 想永久改变生产产出：改 processor.ts。
//  - 想注入反例自测（如灰度）：给本函数传第二参覆盖，上游 normalize / 下游测宽高比与入库一行不改。

import type { ImageProcessor } from './processor';
import { defaultProcessor } from './processor';
import { normalizeImage } from './normalize';

/** 一次上传走完管线的产出：可直接交给 add-item 入库成一件 source:'user' 的 Item。 */
export interface UploadResult {
  /** 可入场景的图（处理接口产出，本期为重编码 data: URL）。 */
  imageSrc: string;
  /** 实测宽高比 = 宽 / 高（对**处理接口的产出**实测；抠图会改尺寸，故测产出而非原图）。 */
  aspectRatio: number;
  /** 产出像素宽。 */
  width: number;
  /** 产出像素高。 */
  height: number;
  /** 由文件名派生的建议物件名（去扩展名；空则回退）。 */
  suggestedName: string;
}

/** 由文件名派生物件名：去掉扩展名、trim；空则回退「新物件」。 */
export function nameFromFile(file: File): string {
  const base = (file.name || '').replace(/\.[^./\\]+$/, '').trim();
  return base || '新物件';
}

/**
 * 走完上传管线主链路：normalize → processor → 测宽高比 → UploadResult。
 * @param file      用户选的图片文件。
 * @param processor 处理接口（默认 defaultProcessor=恒等直通）。自测注入反例即传此参。
 */
export async function runUploadPipeline(
  file: File,
  processor: ImageProcessor = defaultProcessor,
): Promise<UploadResult> {
  const normalized = await normalizeImage(file);
  const processed = await processor(normalized);
  const aspectRatio = processed.height > 0 ? processed.width / processed.height : 1;
  return {
    imageSrc: processed.dataUrl,
    aspectRatio,
    width: processed.width,
    height: processed.height,
    suggestedName: nameFromFile(file),
  };
}
