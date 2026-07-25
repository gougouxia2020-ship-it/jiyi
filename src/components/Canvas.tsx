// 画布（满屏沉浸 · N2-S1）：整个视口 = 一间房。三段结构自底向上——
//  - .scene-blur：同图放大模糊版铺满补边（cover + blur≈30px + 轻微降亮），任意比例都不露底色；
//  - img.scene-img：场景图本体 contain 居中完整显示（object-fit:contain，竖/横/方图都不裁图面）；
//  - .stage::after：画布暗角（沿用 --canvas-inset 气质），压在场景层之上、物件层之下；
//  - .stage__items：物件层，绝对定位 + transform 摆放。
//
// 坐标系（schema v3）：物件锚定「场景图坐标系」= contain 后场景图占据的矩形 imgRect（非整块可视区）。
//  placement.x/y = 物件中心在图内的百分比，placement.w = 物件宽占图宽的百分比；窗口任意缩放时
//  imgRect 随之重算、物件位置与大小一起重排——钉在房间同一相对位置与相对大小。允许坐标出界（进补边区）。
//
// 变换交互（沿用 M2 机制底座，仅把落位/尺寸的换算换到 imgRect + w）：Pointer Events 一套逻辑，
//  中间态只经 rAF 直改 DOM transform（拖/缩/转路径零重渲染、跟手不掉帧），松手才一次性 dispatch 提交
//  → 经 App 全量落 LocalStorage、刷新完整还原。缩放中间态用 tf 层的 scale() 过渡（不触发重排），
//  松手把最终宽度折算成 w 提交、重渲染按 w 直接定尺。
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { GalleryState, Scene } from '../model/types';
import type { GalleryAction } from '../state/gallery';
import { getBackgroundById } from '../assets/manifest';
import { knownBackgroundAspect, recordBackgroundAspect } from '../assets/backgroundAspect';
import { placementsOfScene } from '../state/gallery';
import { StoryModal } from './StoryModal';

interface CanvasProps {
  state: GalleryState;
  scene: Scene | undefined;
  dispatch: Dispatch<GalleryAction>;
  /** 拖动让路：画布挪动手势跨过阈值置 true、松手/取消置 false（父层据此给 .app 挂 .is-dragging）。 */
  onDragChange: (dragging: boolean) => void;
}

/** 低于此位移（px）视为「点击选中」而非「拖动」，滤掉鼠标/手指的轻微抖动。 */
const DRAG_THRESHOLD = 3;
/** 宽度钳制范围（占图宽的百分比；避免缩到不可见 / 撑爆房间）。 */
const MIN_W = 4;
const MAX_W = 48;

/** contain 几何：场景图在可视区内 contain 居中后占据的矩形（相对 stage 左上角的 px）。 */
interface ImgRect {
  ox: number;
  oy: number;
  iw: number;
  ih: number;
}
function containRect(stageW: number, stageH: number, aspect: number | null): ImgRect {
  // aspect = 图宽/图高。未知或非法时退化为整块可视区（首帧/未加载时的兜底，加载后即校正）。
  if (!aspect || !isFinite(aspect) || aspect <= 0 || stageW <= 0 || stageH <= 0) {
    return { ox: 0, oy: 0, iw: Math.max(0, stageW), ih: Math.max(0, stageH) };
  }
  const iw = Math.min(stageW, stageH * aspect);
  const ih = iw / aspect;
  return { ox: (stageW - iw) / 2, oy: (stageH - ih) / 2, iw, ih };
}

type GestureMode = 'move' | 'scale' | 'rotate';

interface GestureState {
  mode: GestureMode;
  pointerId: number;
  placementId: string;
  itemEl: HTMLElement; // .stage__item —— 位移层（move 时改它的 transform）
  tfEl: HTMLElement; // .stage__tf —— 旋转/缩放层（scale/rotate 时改它的 transform）
  // 起手时的场景图矩形（把 px 位移/尺寸换算回图内百分比时的参照系）。
  rect: ImgRect;
  // move
  startClientX: number;
  startClientY: number;
  baseCenterX: number; // 起手时物件中心的 px（stage 内）
  baseCenterY: number;
  wpx: number; // 起手时物件宽度 px（move/scale 定位共用）
  hpx: number; // 起手时物件高度 px
  // scale / rotate 共享的中心与基线
  centerX: number;
  centerY: number;
  startDist: number; // scale：起手时指针到中心的距离
  startAngle: number; // rotate：起手时指针相对中心的角度（rad）
  baseW: number; // 起手时的 w（百分比）
  baseRotation: number;
  // 实时值（提交时用）
  x: number; // 中心百分比
  y: number;
  w: number; // 宽度百分比
  rotation: number;
  moved: boolean;
  rafId: number | null;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// —— Canva 式手柄/工具条的真 SVG 图标（描边 currentColor，自 v2 起替代字符 ⟳/✎/×）——
// 统一 24×24 viewBox、fill:none、stroke 走 currentColor（尺寸/颜色由 CSS 控），与 A2 demo 逐一对齐。
const SVG_PROPS = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

/** 旋转图标（环形箭头）——用于选框正下方旋转圆钮。 */
function RotateIcon() {
  return (
    <svg {...SVG_PROPS}>
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}

/** 铅笔图标——用于工具条「写它的故事」。 */
function StoryIcon() {
  return (
    <svg {...SVG_PROPS}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

/** 垃圾桶图标——用于工具条「移除」。 */
function TrashIcon() {
  return (
    <svg {...SVG_PROPS}>
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

export function Canvas({ state, scene, dispatch, onDragChange }: CanvasProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null); // 任一手势进行中（加 will-change）
  // 故事弹窗当前打开的 placement id（null=未打开）。故事挂 Item，弹窗入口按模式分流：
  //  - 编辑模式：选中物件后点「✎ 故事」手柄打开（可写/改）。
  //  - 游客模式：直接点物件打开（只读，只弹故事+原图）。
  const [storyOpenId, setStoryOpenId] = useState<string | null>(null);
  const gestureRef = useRef<GestureState | null>(null);
  // 场景可视区（stage）尺寸 + 场景图宽高比：合成 imgRect（contain 后场景图矩形）——物件百分比↔像素
  // 换算的参照系。stage 尺寸用 ResizeObserver 跟随视口实时更新；aspect 由场景图 onLoad 读 natural 尺寸。
  const stageRef = useRef<HTMLElement | null>(null);
  const [stageSize, setStageSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  // 场景图宽高比：初值优先取预热缓存里「已知的固有宽高比」（E1-S1）——这样即便可见 <img> 尚未 onLoad，
  //  首帧就按真实 imgRect 摆放物件、落点不跑偏（不依赖背景图恰好加载完）；缓存未命中才 null（退化整块
  //  stage，onLoad 后即校正）。
  const [sceneAspect, setSceneAspect] = useState<number | null>(
    () => knownBackgroundAspect(scene?.backgroundId) ?? null,
  );
  const editable = state.mode === 'edit';

  // 切场景 / 切模式时清空选中态与故事弹窗；切场景另需重置图宽高比（等新场景图 onLoad 再定）。
  useEffect(() => {
    setSelectedId(null);
    setStoryOpenId(null);
  }, [scene?.id, state.mode]);
  // 切背景：重置为该背景「已知的固有宽高比」（缓存命中即无缝、不闪一帧 stage 比例），未知才 null 等 onLoad。
  useEffect(() => {
    setSceneAspect(knownBackgroundAspect(scene?.backgroundId) ?? null);
  }, [scene?.backgroundId]);

  // 卸载兜底：收掉未跑完的 rAF，避免操作已卸载的 DOM。
  useEffect(() => {
    return () => {
      if (gestureRef.current?.rafId != null) cancelAnimationFrame(gestureRef.current.rafId);
      gestureRef.current = null;
    };
  }, []);

  // 测量 stage 尺寸。useLayoutEffect + ResizeObserver：首帧绘制前即量好（无跳位闪烁），视口/布局
  // 变化时随之更新，重渲染即按新 imgRect 把百分比重铺（物件相对房间位置与大小不变）。
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setStageSize((prev) => (prev.w === r.width && prev.h === r.height ? prev : { w: r.width, h: r.height }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [scene?.id]);

  /** 当前场景图矩形（读当前 stageSize + sceneAspect 的闭包值）。 */
  function curRect(): ImgRect {
    return containRect(stageSize.w, stageSize.h, sceneAspect);
  }

  function commitAndEnd(commit: boolean) {
    const g = gestureRef.current;
    if (!g) return;
    if (g.rafId != null) cancelAnimationFrame(g.rafId);
    if (commit && g.moved) {
      if (g.mode === 'move') {
        dispatch({ type: 'move-placement', placementId: g.placementId, x: g.x, y: g.y });
      } else if (g.mode === 'scale') {
        dispatch({ type: 'resize-placement', placementId: g.placementId, w: g.w });
      } else {
        dispatch({ type: 'rotate-placement', placementId: g.placementId, rotation: g.rotation });
      }
    } else if (!commit) {
      // pointercancel：state 未变，把手动直改的 DOM transform 还原，避免脱离状态的视觉残留。
      if (g.mode === 'move') {
        g.itemEl.style.transform = `translate(${g.baseCenterX - g.wpx / 2}px, ${g.baseCenterY - g.hpx / 2}px)`;
      } else {
        g.tfEl.style.transform = `rotate(${g.baseRotation}deg)`;
      }
    }
    gestureRef.current = null;
    setActiveId(null);
    onDragChange(false); // 手势结束：浮层浮回（对 move 生效；scale/rotate 未曾置 true，幂等无副作用）
  }

  /** 缩放/旋转的旋转中心：取 <img> 的 boundingRect 中心（对称核心，不含手柄的非对称外延）。 */
  function centerOf(tfEl: HTMLElement): { cx: number; cy: number } {
    const img = tfEl.querySelector('.stage__node') as HTMLElement | null;
    const rect = (img ?? tfEl).getBoundingClientRect();
    return { cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 };
  }

  // —— 手势开始（三种入口，共用 move/up/cancel）——

  function onItemPointerDown(
    e: ReactPointerEvent<HTMLImageElement>,
    p: { id: string; itemId: string; x: number; y: number; w: number; rotation: number },
  ) {
    e.stopPropagation();
    if (!editable) return;
    if (gestureRef.current) return; // 已有一路手势在跑，不并发第二路
    const imgEl = e.currentTarget;
    const tfEl = imgEl.closest('.stage__tf') as HTMLElement;
    const itemEl = imgEl.closest('.stage__item') as HTMLElement;
    try {
      imgEl.setPointerCapture(e.pointerId);
    } catch {
      /* 少数环境不支持捕获；不阻断，元素内仍能收到 move */
    }
    const rect = curRect();
    const item = state.items.find((i) => i.id === p.itemId);
    const wpx = (p.w / 100) * rect.iw;
    const hpx = wpx / (item?.aspectRatio || 1);
    gestureRef.current = {
      mode: 'move',
      pointerId: e.pointerId,
      placementId: p.id,
      itemEl,
      tfEl,
      rect,
      startClientX: e.clientX,
      startClientY: e.clientY,
      baseCenterX: rect.ox + (p.x / 100) * rect.iw,
      baseCenterY: rect.oy + (p.y / 100) * rect.ih,
      wpx,
      hpx,
      centerX: 0,
      centerY: 0,
      startDist: 0,
      startAngle: 0,
      baseW: p.w,
      baseRotation: p.rotation,
      x: p.x,
      y: p.y,
      w: p.w,
      rotation: p.rotation,
      moved: false,
      rafId: null,
    };
    setSelectedId(p.id);
    // 重选物件即收起上一次开着的故事弹窗（编辑弹窗从「✎ 手柄」重新打开，态不残留）。
    setStoryOpenId(null);
  }

  function onScalePointerDown(
    e: ReactPointerEvent<HTMLDivElement>,
    p: { id: string; itemId: string; x: number; y: number; w: number; rotation: number },
  ) {
    e.stopPropagation();
    if (!editable) return;
    if (gestureRef.current) return;
    const handleEl = e.currentTarget;
    const tfEl = handleEl.closest('.stage__tf') as HTMLElement;
    const itemEl = handleEl.closest('.stage__item') as HTMLElement;
    const { cx, cy } = centerOf(tfEl);
    const rect = curRect();
    const item = state.items.find((i) => i.id === p.itemId);
    const wpx = (p.w / 100) * rect.iw;
    const hpx = wpx / (item?.aspectRatio || 1);
    try {
      handleEl.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    gestureRef.current = {
      mode: 'scale',
      pointerId: e.pointerId,
      placementId: p.id,
      itemEl,
      tfEl,
      rect,
      startClientX: e.clientX,
      startClientY: e.clientY,
      baseCenterX: cx,
      baseCenterY: cy,
      wpx,
      hpx,
      centerX: cx,
      centerY: cy,
      startDist: Math.hypot(e.clientX - cx, e.clientY - cy) || 1,
      startAngle: 0,
      baseW: p.w,
      baseRotation: p.rotation,
      x: p.x,
      y: p.y,
      w: p.w,
      rotation: p.rotation,
      moved: false,
      rafId: null,
    };
  }

  function onRotatePointerDown(
    e: ReactPointerEvent<HTMLButtonElement>,
    p: { id: string; x: number; y: number; w: number; rotation: number },
  ) {
    e.stopPropagation();
    if (!editable) return;
    if (gestureRef.current) return;
    const handleEl = e.currentTarget;
    const tfEl = handleEl.closest('.stage__tf') as HTMLElement;
    const itemEl = handleEl.closest('.stage__item') as HTMLElement;
    const { cx, cy } = centerOf(tfEl);
    try {
      handleEl.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    gestureRef.current = {
      mode: 'rotate',
      pointerId: e.pointerId,
      placementId: p.id,
      itemEl,
      tfEl,
      rect: curRect(),
      startClientX: e.clientX,
      startClientY: e.clientY,
      baseCenterX: cx,
      baseCenterY: cy,
      wpx: 0,
      hpx: 0,
      centerX: cx,
      centerY: cy,
      startDist: 0,
      startAngle: Math.atan2(e.clientY - cy, e.clientX - cx),
      baseW: p.w,
      baseRotation: p.rotation,
      x: p.x,
      y: p.y,
      w: p.w,
      rotation: p.rotation,
      moved: false,
      rafId: null,
    };
  }

  // —— 共用的 move / up / cancel（挂在所有交互元素上；捕获保证事件回到起手元素）——

  function onGesturePointerMove(e: ReactPointerEvent<Element>) {
    const g = gestureRef.current;
    if (!g || e.pointerId !== g.pointerId) return;
    if (g.mode === 'move') {
      const dx = e.clientX - g.startClientX;
      const dy = e.clientY - g.startClientY;
      if (!g.moved) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        g.moved = true;
        setActiveId(g.placementId);
        // 拖动让路铁律（画布挪动）：越过阈值即淡出全部浮层，物件可落到浮层平时覆盖的区域（如最顶部）。
        onDragChange(true);
      }
      const cx = g.baseCenterX + dx;
      const cy = g.baseCenterY + dy;
      // 中心 px → 图内百分比（允许出界进补边区，不钳制）。
      g.x = g.rect.iw > 0 ? ((cx - g.rect.ox) / g.rect.iw) * 100 : g.x;
      g.y = g.rect.ih > 0 ? ((cy - g.rect.oy) / g.rect.ih) * 100 : g.y;
    } else if (g.mode === 'scale') {
      if (!g.moved) {
        g.moved = true;
        setActiveId(g.placementId);
      }
      const dist = Math.hypot(e.clientX - g.centerX, e.clientY - g.centerY);
      g.w = clamp((g.baseW * dist) / g.startDist, MIN_W, MAX_W);
    } else {
      if (!g.moved) {
        g.moved = true;
        setActiveId(g.placementId);
      }
      const ang = Math.atan2(e.clientY - g.centerY, e.clientX - g.centerX);
      g.rotation = g.baseRotation + ((ang - g.startAngle) * 180) / Math.PI;
    }
    if (g.rafId == null) {
      g.rafId = requestAnimationFrame(() => {
        const cur = gestureRef.current;
        if (!cur) return;
        cur.rafId = null;
        // 合成层直改 style，不写 React state：手势路径上零重渲染，松手才提交。
        if (cur.mode === 'move') {
          const cx = cur.rect.ox + (cur.x / 100) * cur.rect.iw;
          const cy = cur.rect.oy + (cur.y / 100) * cur.rect.ih;
          cur.itemEl.style.transform = `translate(${cx - cur.wpx / 2}px, ${cy - cur.hpx / 2}px)`;
        } else if (cur.mode === 'scale') {
          // 缩放中间态：tf 层用 scale() 过渡（不改宽度→不触发重排），松手才折算成 w 定尺。
          cur.tfEl.style.transform = `rotate(${cur.baseRotation}deg) scale(${cur.w / cur.baseW})`;
        } else {
          cur.tfEl.style.transform = `rotate(${cur.rotation}deg)`;
        }
      });
    }
  }

  function onGesturePointerUp(e: ReactPointerEvent<Element>) {
    const g = gestureRef.current;
    if (!g || e.pointerId !== g.pointerId) return;
    try {
      (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    commitAndEnd(true);
  }

  function onGesturePointerCancel(e: ReactPointerEvent<Element>) {
    const g = gestureRef.current;
    if (!g || e.pointerId !== g.pointerId) return;
    commitAndEnd(false);
  }

  if (!scene) {
    return (
      <section className="stage stage--empty" data-testid="canvas" aria-label="画布">
        <div className="stage__placeholder">
          <p className="stage__placeholder-title">还没有场景</p>
          <p className="stage__placeholder-sub">
            {state.mode === 'edit' ? '点场景条「＋ 新场景」，绑定一张背景开始陈列' : '暂无可预览的场景'}
          </p>
        </div>
      </section>
    );
  }

  const bg = getBackgroundById(scene.backgroundId);
  const placements = placementsOfScene(state, scene.id);
  const rect = curRect();
  // 场景内当前最大的持久化 z：选中态置顶时用它 +1 算临时渲染层叠值，纯视觉、不写回状态。
  const maxZ = placements.reduce((max, pl) => (pl.z > max ? pl.z : max), 0);
  // 故事弹窗的目标物件：从「打开弹窗」的这次摆放解到 Item（故事挂 Item）。
  const storyPlacement = storyOpenId ? placements.find((pl) => pl.id === storyOpenId) : undefined;
  const storyItem = storyPlacement
    ? state.items.find((i) => i.id === storyPlacement.itemId)
    : undefined;

  return (
    <section
      ref={stageRef}
      className="stage"
      data-testid="canvas"
      data-scene-id={scene.id}
      data-mode={state.mode}
      aria-label={`画布 · ${scene.name}`}
      // 点画布空白：清选中态 + 关故事弹窗（交互铁律「再点空白关闭」）。点在物件/弹窗上的指针各自
      // stopPropagation，不会冒泡到这里，故只有真正点空白才触发。
      onPointerDown={() => {
        setSelectedId(null);
        setStoryOpenId(null);
      }}
    >
      {/* 补边层：同图放大模糊版铺满，任意比例都不露底色、不裁图面（图面完整在 scene-img 上呈现）。 */}
      <div
        className="scene-blur"
        data-testid="canvas-bg"
        style={bg ? { backgroundImage: `url(${bg.imageSrc})` } : undefined}
      />
      {/* 场景图本体：object-fit:contain 居中完整显示；onLoad 读 natural 尺寸定宽高比（物件坐标参照系）。 */}
      {bg && (
        <img
          className="scene-img"
          data-testid="scene-img"
          src={bg.imageSrc}
          alt={`场景 · ${scene.name}`}
          draggable={false}
          onLoad={(e) => {
            const el = e.currentTarget;
            if (el.naturalWidth > 0 && el.naturalHeight > 0) {
              // 回喂缓存：供落点换算/后续渲染复用「已知固有宽高比」，不必每次都等各自的 <img> onLoad。
              recordBackgroundAspect(scene.backgroundId, el.naturalWidth, el.naturalHeight);
              setSceneAspect(el.naturalWidth / el.naturalHeight);
            }
          }}
        />
      )}

      {/* 物件层（压在暗角之上）：绝对定位 + transform 摆放。 */}
      <div className="stage__items">
        {placements.map((p) => {
          // 物件目录取自 state.items（双源：内置 14 件 + 用户上传件）——用户上传件不在 manifest 里，
          //  必须从状态树解，否则拖进场景后取不到、渲染不出（U2-S2 打通「用户件进场景」的关键）。
          const item = state.items.find((i) => i.id === p.itemId);
          if (!item) return null;
          // 入场景渲染用「展示图」（displayImageSrc；本期与 imageSrc 同源）；空则回退 imageSrc。
          //  刷新后用户件的图位在 hydrate 完成前为空——占位不渲染坏图，hydrate 回填后重渲染即显示。
          const nodeSrc = item.displayImageSrc || item.imageSrc;
          const selected = selectedId === p.id;
          const active = activeId === p.id;
          // 选中态临时置顶（渲染层叠 = 场景最大 z + 1）；未选中用它自己持久化的 p.z。
          const renderZ = selected ? maxZ + 1 : p.z;
          const showChrome = selected && editable;
          // 场景图坐标系百分比 → 当前 imgRect 的像素几何：中心 (cx,cy)、宽 wpx、高 hpx（由物件宽高比导出）。
          const wpx = (p.w / 100) * rect.iw;
          const hpx = wpx / (item.aspectRatio || 1);
          const cx = rect.ox + (p.x / 100) * rect.iw;
          const cy = rect.oy + (p.y / 100) * rect.ih;
          const leftPx = cx - wpx / 2;
          const topPx = cy - hpx / 2;
          return (
            <div
              key={p.id}
              className={`stage__item${active ? ' is-active' : ''}`}
              data-testid="placement"
              data-placement-id={p.id}
              data-item-id={p.itemId}
              // placement(x,y,w,rotation,z) 全量暴露为 data-*（存储的百分比原值）供验收核对刷新还原。
              data-x={p.x}
              data-y={p.y}
              data-w={p.w}
              data-rotation={p.rotation}
              data-z={p.z}
              style={{ transform: `translate(${leftPx}px, ${topPx}px)`, zIndex: renderZ }}
            >
              <div className="stage__tf" style={{ transform: `rotate(${p.rotation}deg)` }}>
                <img
                  className="stage__node"
                  // 刷新后用户件在 hydrate 完成前图位为空：src 省略而非空串，避免浏览器对 "" 发起
                  //  对页面 URL 的请求 / 报错；hydrate 回填后重渲染即带上真实 src。
                  src={nodeSrc || undefined}
                  alt={item.name}
                  draggable={false}
                  style={{ width: `${wpx}px` }}
                  onPointerDown={(e) => onItemPointerDown(e, p)}
                  onPointerMove={onGesturePointerMove}
                  onPointerUp={onGesturePointerUp}
                  onPointerCancel={onGesturePointerCancel}
                  // 游客模式：点物件只弹半透明故事弹窗（只读，故事+原图）——不选中、不出手柄、不可变换。
                  onClick={(e) => {
                    if (!editable) {
                      e.stopPropagation();
                      setStoryOpenId(p.id);
                    }
                  }}
                />

                {showChrome && (
                  <>
                    {/* 陶土红细选框（--sel-line，纯装饰不拦指针，让物件中心可拖动） */}
                    <div className="stage__frame" aria-hidden="true" />

                    {/* 四角白色圆点手柄（--h2-*）：拖动即按中心等比缩放（任一角行为一致）。
                        圆点视觉尺寸恒 --h2-size；触摸命中区由 CSS ::after 撑到 --h2-hit（视觉不放大）。 */}
                    {(['tl', 'tr', 'bl', 'br'] as const).map((corner) => (
                      <div
                        key={corner}
                        className={`stage__handle stage__handle--${corner}`}
                        data-testid="handle-scale"
                        data-corner={corner}
                        role="slider"
                        aria-label="缩放手柄"
                        onPointerDown={(e) => onScalePointerDown(e, p)}
                        onPointerMove={onGesturePointerMove}
                        onPointerUp={onGesturePointerUp}
                        onPointerCancel={onGesturePointerCancel}
                      />
                    ))}

                    {/* 选框正下方旋转圆钮（真旋转图标 SVG，随物件旋转/缩放一起走）：拖动即绕中心旋转 */}
                    <button
                      type="button"
                      className="stage__rot"
                      data-testid="handle-rotate"
                      aria-label="旋转手柄"
                      onPointerDown={(e) => onRotatePointerDown(e, p)}
                      onPointerMove={onGesturePointerMove}
                      onPointerUp={onGesturePointerUp}
                      onPointerCancel={onGesturePointerCancel}
                    >
                      <RotateIcon />
                    </button>
                  </>
                )}
              </div>

              {/* 浮动毛玻璃小工具条（恒水平·悬于选框上方）：故事 / 删除，为置顶·复制等后续操作留口子。
                  挂在 .stage__item（位移层，不随 .stage__tf 旋转/缩放）→ 恒水平；任一手势进行中淡出让路。
                  真 SVG 图标（铅笔=写故事、垃圾桶=移除），不用字符 ✎/×。 */}
              {showChrome && (
                <div
                  className={`stage__toolbar${active ? ' is-hidden' : ''}`}
                  data-testid="placement-toolbar"
                  role="toolbar"
                  aria-label={`「${item.name}」操作`}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    className="stage__toolbar-btn"
                    data-testid="placement-story"
                    aria-label={`编辑「${item.name}」的故事`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setStoryOpenId(p.id);
                    }}
                  >
                    <StoryIcon />
                  </button>
                  <span className="stage__toolbar-div" aria-hidden="true" />
                  <button
                    type="button"
                    className="stage__toolbar-btn"
                    data-testid="placement-remove"
                    aria-label={`移除「${item.name}」`}
                    onClick={(e) => {
                      e.stopPropagation();
                      dispatch({ type: 'remove-placement', placementId: p.id });
                      setSelectedId(null);
                      if (storyOpenId === p.id) setStoryOpenId(null);
                    }}
                  >
                    <TrashIcon />
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {placements.length === 0 && state.mode === 'edit' && (
          <p className="stage__hint" data-testid="canvas-hint">
            从物件抽屉点选或拖入，放进这个房间
          </p>
        )}
      </div>

      {storyItem && (
        // 半透明故事弹窗：编辑模式可写/改（editable），游客模式只读（只弹故事+原图）。
        // 弹窗浮于房间之上、不占布局宽度（绝对定位于 stage 内），点 ✕/点画布空白关闭。
        <StoryModal
          key={storyItem.id}
          item={storyItem}
          imageSrc={storyItem.imageSrc}
          sceneName={scene.name}
          editable={editable}
          onSave={(story) => {
            dispatch({ type: 'set-item-story', itemId: storyItem.id, story });
            setStoryOpenId(null);
          }}
          onClose={() => setStoryOpenId(null)}
        />
      )}
    </section>
  );
}
