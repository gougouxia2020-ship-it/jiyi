// 念念 · 陈列室 —— 背景图固有宽高比缓存（E1-S1·消除「只卡第一次」的落点漂移）
//
// 落点换算需要「场景图坐标系」= contain 后场景图矩形（imgRect），其几何取决于背景图的**固有宽高比**
// （宽/高）。可见的 <img class="scene-img"> 在首次加载完成前 naturalWidth 为 0——若此刻退化用 stage
// 比例（视口宽/高）去算 imgRect，落点就会跑偏、可能落进两侧的模糊补边区；等图加载完（缓存命中后）
// 才正常，观感就是「只卡/只跑偏第一次」。
//
// 修法：模块加载即预解码全部内置背景、把固有宽高比记进这张会话内缓存；落点换算（Workbench）与画布
// 渲染（Canvas）都优先读这里「已知的宽高比」，不再依赖可见 <img> 恰好 onLoad。可见 <img> 真正 onLoad
// 时也回喂缓存（recordBackgroundAspect），供后续换算复用。纯前端、仅内存缓存 + 预热解码，无副作用外泄。

import { BACKGROUNDS } from './manifest';

const cache = new Map<string, number>();

function record(id: string, naturalWidth: number, naturalHeight: number): void {
  if (naturalWidth > 0 && naturalHeight > 0) cache.set(id, naturalWidth / naturalHeight);
}

// 模块加载即预热：为每张背景起一个脱离文档的 Image 解码，读到 natural 尺寸即入缓存。app 启动到用户
// 真正完成一次拖拽（移到 dock → 按下 → 越阈值 → 拖到画布 → 松手）之间足够预解码完成，故首拖时宽高比
// 已「已知」。缓存命中时部分浏览器不再触发 onload——命中即 complete，直接同步读一次兜底。
if (typeof Image !== 'undefined') {
  for (const bg of BACKGROUNDS) {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => record(bg.id, img.naturalWidth, img.naturalHeight);
    img.src = bg.imageSrc;
    if (img.complete && img.naturalWidth > 0) record(bg.id, img.naturalWidth, img.naturalHeight);
  }
}

/** 已知的背景固有宽高比（宽/高）；尚未解码出来时返回 undefined（调用方据此保守兜底）。 */
export function knownBackgroundAspect(backgroundId: string | undefined | null): number | undefined {
  return backgroundId ? cache.get(backgroundId) : undefined;
}

/** 可见 <img> 读到 natural 尺寸时回填缓存——喂养后续的落点换算与画布渲染。 */
export function recordBackgroundAspect(
  backgroundId: string,
  naturalWidth: number,
  naturalHeight: number,
): void {
  record(backgroundId, naturalWidth, naturalHeight);
}
