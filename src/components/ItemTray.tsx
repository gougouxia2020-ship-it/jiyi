// 物件 dock（N2-S2·浮层玻璃四件套之四；N3·物件重命名）：左侧毛玻璃浮层，纵列缩略卡列出全部 14 件物件。
//
// 相对 N2 的升级（N3·管理与命名）：缩略卡的物件名支持就地编辑——点名字进入编辑、回车/失焦即存
//  （InlineEdit 统一手感，不开独立设置页）。名字挂在 Item 本身（state.items），故一处改名、该物件
//  在所有场景的摆放都跟着更新（跨场景同步）；改动随状态持久化、刷新后仍在。缩略卡因此改吃 state.items
//  （而非静态素材清单）：id/imageSrc 仍是构建资源、name 取自可被重命名的状态。
//
// dock 结构与手感沿用 N2-S2：可收合成贴边把手（视觉居中补偿）、窄屏默认收起、拖动让路。
// 拖拽入口沿用 M2-S2：真实拖拽（Pointer Events + setPointerCapture），拖动浮出跟手幽灵（ghost），
// 松手若落在视口内 → 经 onDropItemAt 在落点建 placement；未越拖动阈值（等同点选）→ 走 onPlaceItem。
// —— 缩略卡由 <button> 改为 <div>（tray-item）：卡内既要放拖拽/点选手势又要放可编辑名字（<input>），
//    避免「按钮里套输入框/按钮」的非法嵌套；手势守卫与逻辑一字未改，指针仍落在整卡（图片 pointer-events:none）。
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import type { Item } from '../model/types';
import { MAX_UPLOADS } from '../state/gallery';
import { InlineEdit } from './InlineEdit';
import { UploadEntry } from '../upload/UploadEntry';

/** 低于此位移（px）视为「点选」而非「拖拽」。 */
const DRAG_THRESHOLD = 6;

/**
 * 物件是否已可拖/可摆（E1-S1·hydrate 兜底）：用户上传件在刷新后、IndexedDB 图片经 hydrate 回填到
 *  imageSrc 之前，其图位为空——此时若允许拖/摆，会在场景里摆出一个看不见的物件（图片渲染不出、却占
 *  一条 placement）。故图位为空的物件一律不可拖、不可摆。内置 14 件恒带打包资源 URL，永远 ready。
 */
function isItemReady(item: Item): boolean {
  return !!item.imageSrc;
}

interface ItemTrayProps {
  /** 物件目录（取自 state.items——name 可被重命名、跨场景同步、随状态持久化）。 */
  items: Item[];
  canPlace: boolean;
  /** 点选放入（默认网格位）。 */
  onPlaceItem: (itemId: string) => void;
  /** 拖入落点（视口坐标）；由上层判断是否落在画布内并换算画布内坐标。 */
  onDropItemAt: (itemId: string, clientX: number, clientY: number) => void;
  /** 拖动让路：拖拽跨过阈值置 true、松手/取消置 false。父层据此给 .app 挂 .is-dragging。 */
  onDragChange: (dragging: boolean) => void;
  /** 物件重命名：改 Item.name（跨场景同步、持久化）。 */
  onRenameItem: (itemId: string, name: string) => void;
  /** 上传入库（U2-S1）：预览确认后交上层 dispatch add-item（落成 source:'user' 的 Item）。 */
  onAddItem: (item: { name: string; aspectRatio: number; imageSrc: string }) => void;
  /** 删除用户上传件（U3-S1）：交上层删除该物件 + 其在所有场景的摆放 + IndexedDB 图片二进制。 */
  onDeleteItem: (itemId: string) => void;
}

/** 垃圾桶图标——用户物件删除入口（与画布工具条移除钮同款，真 SVG 不用字符）。 */
function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

/**
 * 缩略卡上的删除入口（U3-S1）——只挂在 source:'user' 的缩略卡上（内置 14 件不渲染此组件，
 *  故天然无删除入口）。垃圾桶钮浮在卡片右上角；点它就地弹一句话玻璃确认（删除/取消，不弹大警告框，
 *  与场景删除同款克制语气）。因删除不可逆（连图片二进制一并清），故必经一次确认。
 *  所有指针 stopPropagation：删除手势不冒泡到缩略卡（不触发拖入/点选）。
 */
function ItemDelete({ itemName, onConfirm }: { itemName: string; onConfirm: () => void }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <button
        type="button"
        className="thumb-del"
        data-testid="item-delete"
        aria-label={`删除物件「${itemName}」`}
        title="删除这件物件"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          setConfirming(true);
        }}
      >
        <TrashIcon />
      </button>

      {confirming && (
        <div
          className="thumb-confirm glass"
          role="alertdialog"
          aria-label="确认删除物件"
          data-testid="item-delete-confirm-box"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <span className="thumb-confirm__msg">删除「{itemName}」？</span>
          <div className="thumb-confirm__actions">
            <button
              type="button"
              className="thumb-confirm__yes"
              data-testid="item-delete-confirm"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onConfirm();
              }}
            >
              删除
            </button>
            <button
              type="button"
              className="thumb-confirm__no"
              data-testid="item-delete-cancel"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setConfirming(false);
              }}
            >
              取消
            </button>
          </div>
        </div>
      )}
    </>
  );
}

interface TrayDrag {
  pointerId: number;
  itemId: string;
  startX: number;
  startY: number;
  dragging: boolean;
  x: number;
  y: number;
  rafId: number | null;
  el: HTMLElement;
}

export function ItemTray({
  items,
  canPlace,
  onPlaceItem,
  onDropItemAt,
  onDragChange,
  onRenameItem,
  onAddItem,
  onDeleteItem,
}: ItemTrayProps) {
  const dragRef = useRef<TrayDrag | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);
  // 仅在开始拖拽时置一次（挂载幽灵 + 记住拖的是哪件），松手/取消清一次——拖动路径本身不 setState。
  const [dragItem, setDragItem] = useState<Item | null>(null);
  // 收合态：窄屏（<880px）默认收起成把手，宽屏默认展开。之后只由把手手动切换（不随缩放自动改）。
  const [closed, setClosed] = useState<boolean>(
    () => typeof window !== 'undefined' && window.innerWidth < 880,
  );

  // 已上传的用户件数量（U3-S2·配额）：dock「已传 N/50」与上传入口前置阻止都据此。随上传/删除
  //  改动 items 即重算——上传一件 +1、删除一件 -1，实时更新。
  const uploadedCount = items.reduce((n, i) => (i.source === 'user' ? n + 1 : n), 0);

  function positionGhost(x: number, y: number) {
    if (ghostRef.current) {
      ghostRef.current.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    }
  }

  // 收拾一次拖拽（happy path 的元素松手 与 window 级异常兜底 共用同一套复位逻辑）：
  //  - commit 非空：按落点建摆放（已越拖动阈值）/ 未越阈值则点选放入；
  //  - commit 为 null（pointercancel、窗口外松手、切标签页等异常路径）：只复位、不落点。
  //  任何路径都保证 .is-dragging 复位、幽灵卸载、rAF/指针捕获收干净——不再「窗口外松手就卡死只能刷新」。
  //  用 ref 持有最新闭包，让「仅挂载一次」的 window 监听永不读到过期的回调。
  const finalizeRef = useRef<(commit: { clientX: number; clientY: number } | null) => void>(
    () => {},
  );
  finalizeRef.current = (commit) => {
    const d = dragRef.current;
    if (!d) return;
    if (d.rafId != null) cancelAnimationFrame(d.rafId);
    try {
      d.el.releasePointerCapture(d.pointerId);
    } catch {
      /* ignore */
    }
    // 先摘掉 dragRef，杜绝 window 兜底与元素回调对同一次拖拽的重复收拾。
    dragRef.current = null;
    if (commit) {
      if (d.dragging) {
        onDropItemAt(d.itemId, commit.clientX, commit.clientY); // 松手落点建 placement
      } else {
        onPlaceItem(d.itemId); // 未越阈值＝点选放入（默认网格位）
      }
    }
    setDragItem(null);
    onDragChange(false); // 浮层浮回
  };

  // window 级兜底（E1-S1）：happy path 靠元素上的指针捕获收 pointerup/pointercancel；但
  //  setPointerCapture 失败、拖到浏览器窗口外松手、切标签页等异常路径下，起手元素可能永远收不到
  //  松手事件 → .is-dragging 永久留存、全部浮层淡到 5%、观感「页面死了」，只能刷新。这里在 window 上
  //  补一层网：任何异常松手路径都能把拖拽态复位。仅挂载一次，通过 finalizeRef 调最新逻辑。
  useEffect(() => {
    const onWinUp = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      finalizeRef.current({ clientX: e.clientX, clientY: e.clientY });
    };
    const onWinCancel = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      finalizeRef.current(null);
    };
    const onWinMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      // 在窗口外松手、指针再移回窗内：此时 buttons 已复位为 0（按键早松开）——收拾残局、复位拖拽态，
      //  不落点（避免落进模糊补边区或窗外）。这一条专治「拖到窗口外回来界面卡住需刷新」。
      if (e.buttons === 0) finalizeRef.current(null);
    };
    const onWinBlur = () => {
      // 切标签页 / 切应用：窗口失焦即收手，复位拖拽态（不落点）。
      if (dragRef.current) finalizeRef.current(null);
    };
    window.addEventListener('pointerup', onWinUp);
    window.addEventListener('pointercancel', onWinCancel);
    window.addEventListener('pointermove', onWinMove);
    window.addEventListener('blur', onWinBlur);
    return () => {
      window.removeEventListener('pointerup', onWinUp);
      window.removeEventListener('pointercancel', onWinCancel);
      window.removeEventListener('pointermove', onWinMove);
      window.removeEventListener('blur', onWinBlur);
    };
    // 仅挂载一次；回调经 finalizeRef 取最新，无过期闭包。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>, item: Item) {
    // hydrate 未回填图的用户件不可拖、不可摆（E1-S1）：图位为空即不起手——dragRef 不置、后续 move/up
    //  皆无从触发，天然「不可拖、不会摆出看不见的物件」。canPlace 兼顾模式/场景守卫。
    if (!canPlace || !isItemReady(item)) return;
    const el = e.currentTarget;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    dragRef.current = {
      pointerId: e.pointerId,
      itemId: item.id,
      startX: e.clientX,
      startY: e.clientY,
      dragging: false,
      x: e.clientX,
      y: e.clientY,
      rafId: null,
      el,
    };
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>, item: Item) {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.dragging) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      d.dragging = true;
      setDragItem(item); // 挂载幽灵（一次 render）
      onDragChange(true); // 拖动让路：全部浮层淡出且不接指针
    }
    d.x = e.clientX;
    d.y = e.clientY;
    if (d.rafId == null) {
      d.rafId = requestAnimationFrame(() => {
        const cur = dragRef.current;
        if (!cur) return;
        cur.rafId = null;
        positionGhost(cur.x, cur.y);
      });
    }
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    finalizeRef.current({ clientX: e.clientX, clientY: e.clientY });
  }

  function onPointerCancel(e: ReactPointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    finalizeRef.current(null);
  }

  return (
    <aside
      className={`dock chrome glass${closed ? ' closed' : ''}`}
      data-testid="tray"
      data-closed={closed ? 'true' : 'false'}
      aria-label="物件库"
    >
      {/* 面板：分区标题 + 缩略卡纵列。收起时整块 display:none，只剩把手。 */}
      <div className="dock-panel">
        <div className="dock-head">物件库</div>
        <div className="dock-list" data-testid="dock-list">
          {/* 上传入口（U2-S1）：dock 顶部的「＋」卡 + 配额计数「已传 N/50」（U3-S2）。
              游客模式因 dock 整体不渲染而天然无此入口与计数。 */}
          <UploadEntry onAddItem={onAddItem} count={uploadedCount} max={MAX_UPLOADS} />
          {items.map((item) => {
            // hydrate 未回填图的用户件（imageSrc 空）此时不可拖、不可摆——data-ready 供样式/验收识别。
            const ready = isItemReady(item);
            const draggable = canPlace && ready;
            return (
            <div
              key={item.id}
              className={`thumb${draggable ? '' : ' is-disabled'}`}
              data-testid="tray-item"
              data-item-id={item.id}
              data-ready={ready ? 'true' : 'false'}
              aria-disabled={!draggable}
              title={
                !ready
                  ? `「${item.name}」图片加载中，稍候可拖入`
                  : canPlace
                    ? `把「${item.name}」拖入或点入房间`
                    : item.name
              }
              onPointerDown={(e) => onPointerDown(e, item)}
              onPointerMove={(e) => onPointerMove(e, item)}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerCancel}
            >
              {/* 删除入口（U3-S1）：仅用户上传件有——内置 14 件不渲染此组件，天然无删除入口。
                  入口长在 dock 内部（.dock 只在编辑模式渲染），游客模式随 dock 整体隐藏、天然无入口。 */}
              {item.source === 'user' && (
                <ItemDelete itemName={item.name} onConfirm={() => onDeleteItem(item.id)} />
              )}
              {/* 刷新后用户上传件在 hydrate 回填前 imageSrc 为空：src 省略而非空串（避免对 "" 发请求/报错）；
                  hydrate 从 IndexedDB 取回图后重渲染即显示缩略。 */}
              <img className="itm" src={item.imageSrc || undefined} alt={item.name} loading="lazy" draggable={false} />
              {/* 物件名就地编辑（N3）：点名字进入编辑、回车/失焦即存；指针不冒泡到卡片（不触发拖拽/点选）。 */}
              <InlineEdit
                value={item.name}
                onCommit={(name) => onRenameItem(item.id, name)}
                inputClassName="thumb-name-input"
                inputTestId="item-name-input"
                ariaLabel="重命名物件"
              >
                {(beginEdit) => (
                  <span
                    className="thumb-name"
                    data-testid="item-name"
                    role="button"
                    tabIndex={0}
                    title="点一下改名"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (canPlace) beginEdit();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (canPlace) beginEdit();
                      }
                    }}
                  >
                    {item.name}
                  </span>
                )}
              </InlineEdit>
            </div>
            );
          })}
        </div>
      </div>

      {/* 贴边把手：收/展物件库。收起态把手竖条贴左缘、纵向居中；展开态贴面板右缘。 */}
      <button
        type="button"
        className="dock-tab"
        data-testid="dock-tab"
        aria-label={closed ? '展开物件库' : '收起物件库'}
        aria-expanded={!closed}
        title={closed ? '展开物件库' : '收起物件库'}
        onClick={() => setClosed((v) => !v)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>

      {/* 跟手幽灵（E1-S1·核心修复）：经 createPortal 逃到 document.body 渲染，脱离 dock 的
          transform + overflow:hidden（该组合会为其内的 position:fixed 幽灵建立包含块并把它裁掉——
          正是「首拖什么都不跟手、观感页面死了」的根因）。到了 body 顶层，position:fixed 相对视口定位、
          无任何祖先裁剪，拖动全程跟着指针在视口里走、清晰可见。照 UploadEntry 上传预览已验证的做法。 */}
      {dragItem &&
        createPortal(
          <div
            className="tray__ghost"
            data-testid="drag-ghost"
            aria-hidden="true"
            ref={(el) => {
              ghostRef.current = el;
              if (el && dragRef.current) positionGhost(dragRef.current.x, dragRef.current.y);
            }}
          >
            <img src={dragItem.imageSrc || undefined} alt="" draggable={false} />
          </div>,
          document.body,
        )}
    </aside>
  );
}
