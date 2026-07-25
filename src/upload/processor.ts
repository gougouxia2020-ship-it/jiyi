// 念念 · 陈列室 —— 【处理接口】（U2-S1·上传管线的关键设计点）
//
// 契约：签名恒为「一张规范化后的图 → 一张可入场景的图」。本期实现为**恒等直通**（原图即成品）。
// 这是将来接抠图 / 风格化的**唯一插入点**——替换本层实现即可改变上传产出，
// 上下游（解码降采样 normalize、宽高比测量、入库 add-item、存储 persistence、UI）一行不用改。

/** 规范化后的图（processor 的输入）：EXIF 已校正、长边已降采样、已重编码压缩。 */
export interface NormalizedImage {
  /** 位图数据（本期为重编码后的 data: URL）。 */
  dataUrl: string;
  /** 规范化后的像素宽（已含 EXIF 方向校正、已降采样）。 */
  width: number;
  /** 规范化后的像素高。 */
  height: number;
}

/** 可入场景的图（processor 的输出）：本期与输入同形；将来抠图后为透明 PNG（尺寸/像素可变）。 */
export type ProcessedImage = NormalizedImage;

/**
 * 处理接口签名：一张规范化后的图 → 一张可入场景的图。可同步或异步（将来抠图/风格化多为异步）。
 * 上游 normalize、下游测宽高比 / 入库只依赖本签名，不关心内部怎么处理。
 */
export type ImageProcessor = (input: NormalizedImage) => Promise<ProcessedImage> | ProcessedImage;

/**
 * 恒等直通处理器（本期实现）：原图即成品，不改一像素、不改尺寸。
 * 将来接抠图：把本函数体换成「解码 → 抠图 → 输出透明 PNG」即可，上下游一行不动。
 */
export const identityProcessor: ImageProcessor = (input) => ({ ...input });

/**
 * 生产默认处理器——上传管线（pipeline.runUploadPipeline）不显式传 processor 时用它。
 * 本期指向恒等直通（identityProcessor）。这是「唯一插入点」的运行期实现槽：
 *   · 想永久改变生产产出：改这里初值指向的实现（或替换 identityProcessor 的函数体）即可，别处一行不动。
 *   · 想运行期整层替换（接抠图/风格化，或注入反例自测）：调 setImageProcessor(...) 换掉本槽即可——
 *     上游 normalize、下游测宽高比 / 入库 add-item / 存储 persistence / UI 一行不用改（criteria[2] 的架构保证）。
 *
 * 用 `let` + live binding：pipeline.ts 以 `import { defaultProcessor }` 取本槽并作为默认参数，
 *  运行期在此重赋值后，pipeline 下一次调用即读到新实现（ESM 实时绑定），无需改 pipeline 一行。
 */
export let defaultProcessor: ImageProcessor = identityProcessor;

/**
 * 整层替换处理接口的运行期实现（「唯一插入点」的替换入口）。
 * 替换后，未显式传 processor 的 runUploadPipeline 即走新实现——上下游 / 存储 / UI 全不动。
 */
export function setImageProcessor(processor: ImageProcessor): void {
  defaultProcessor = processor;
}

/** 复位为恒等直通（本期生产默认）。用于自测收尾或撤销运行期替换。 */
export function resetImageProcessor(): void {
  defaultProcessor = identityProcessor;
}
