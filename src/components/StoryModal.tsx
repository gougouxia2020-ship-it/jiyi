// 物件故事弹窗（M3-S2）—— 半透明奶油弹窗，点物件弹出，浮于画布之上、不占画布宽度。
//
// 契约边界（对齐 taste/design.md 硬指标 + 交互铁律）：
//  - 视觉：--color-popup 半透明奶油底 + backdrop-filter blur(9px) 透出背后房间、陶土红描边
//    （--color-popup-line）、--shadow-float 浮动阴影；含 ✕ 关闭、「它的故事」kicker、衬线标题、
//    meta、故事正文、「原始照片」缩略。逐一对齐 A-旧信.html 的 .popup。
//  - 双模式（editable）：
//      · 编辑模式 → 在同一弹窗内追加输入区（textarea）+「保存故事」；保存经 onSave 交回上层
//        dispatch set-item-story（改 Item.story，跨场景同步、全量落 LocalStorage）。
//      · 游客模式 → 只读：只渲染故事正文 + 原始照片，绝不出现输入区/保存钮（点物件只弹故事+原图）。
//  - 关闭：✕ 或（由上层）点画布空白关闭。弹窗内的指针/点击不冒泡到画布，避免自我关闭或误清选中态。
//  - 以「打开时的 item.id 为 key」挂载（父组件 key={item.id}）：换物件重新挂载 → 草稿从 item.story 重取，
//    读到的即已跨场景同步的最新故事。
import { useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Item } from '../model/types';

interface StoryModalProps {
  /** 当前展示/编辑故事的物件（故事挂 Item 本身）。 */
  item: Item;
  /** 该物件的原始图片地址（透明抠图）——「原始照片」缩略即用它。 */
  imageSrc: string;
  /** 当前所在场景名，填入 meta 行（「陈列于『客厅』」）。 */
  sceneName: string;
  /** 编辑模式 = true（可写/改）；游客模式 = false（只读，只弹故事+原图）。 */
  editable: boolean;
  /** 保存：把草稿交回上层 dispatch（set-item-story）。 */
  onSave: (story: string) => void;
  /** 关闭弹窗（游客只读关闭 / 编辑取消，均不改动故事）。 */
  onClose: () => void;
}

export function StoryModal({ item, imageSrc, sceneName, editable, onSave, onClose }: StoryModalProps) {
  // 草稿在挂载时从 item.story 取一次（父组件用 key={item.id} 保证换物件时重新挂载→重新取值）。
  const [draft, setDraft] = useState<string>(item.story);

  // 弹窗内的指针不冒泡到画布：画布的 pointerdown 会「点空白关闭 + 清选中态」，弹窗内操作须屏蔽掉。
  function stop(e: ReactPointerEvent<HTMLElement>) {
    e.stopPropagation();
  }

  const hasStory = item.story.trim().length > 0;

  return (
    <div
      className="story"
      data-testid="story-modal"
      data-item-id={item.id}
      data-mode={editable ? 'edit' : 'guest'}
      role="dialog"
      aria-modal="true"
      aria-label={editable ? `编辑「${item.name}」的故事` : `「${item.name}」的故事`}
      onPointerDown={stop}
    >
      <button
        type="button"
        className="story__close"
        data-testid="story-close"
        aria-label="关闭"
        onClick={onClose}
      >
        {/* 真 SVG 图标（叉号），自 v2 起替代字符 ✕（design.md v2：字符图标判不合格）。 */}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      </button>

      <span className="story__kicker">它的故事</span>
      <h3 className="story__name">{item.name}</h3>
      <p className="story__meta">陈列于「{sceneName}」</p>

      {editable ? (
        <textarea
          className="story__input"
          data-testid="story-input"
          placeholder="写下这件旧物的故事……"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
        />
      ) : (
        <p className={`story__body${hasStory ? '' : ' is-empty'}`} data-testid="story-body">
          {hasStory ? item.story : '这件旧物还没有故事。'}
        </p>
      )}

      <div className="story__orig">
        <p className="story__orig-cap">原始照片</p>
        <img
          className="story__photo"
          data-testid="story-photo"
          src={imageSrc}
          alt={`「${item.name}」的原始照片`}
          draggable={false}
        />
      </div>

      {editable && (
        <div className="story__actions">
          <button
            type="button"
            className="story__btn story__btn--ghost"
            data-testid="story-cancel"
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            className="story__btn story__btn--save"
            data-testid="story-save"
            onClick={() => onSave(draft)}
          >
            保存故事
          </button>
        </div>
      )}
    </div>
  );
}
