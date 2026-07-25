// 就地编辑（N3·管理与命名）——三处命名（陈列室名 / 场景名 / 物件名）统一手感的唯一实现：
//  点进去改、回车或失焦即存、Esc 撤销，不开独立设置页。
//
// 用法（render-prop）：平时渲染 children(beginEdit) 给出的展示元素（点它调用 beginEdit 进入编辑）；
//  进入编辑后本组件接管，渲染受控 <input>：
//    · Enter / 失焦(blur) → 提交草稿（onCommit，空白名由各 reducer 自行忽略）
//    · Escape           → 撤销回展示态（不提交）
//  doneRef 去重：Enter 触发提交后 input 卸载引发的 blur 不会二次提交。
import { useRef, useState, type ReactNode } from 'react';

interface InlineEditProps {
  /** 当前值（进入编辑时作为草稿初值）。 */
  value: string;
  /** 提交：把草稿交回上层 dispatch（rename-scene / set-item-name / set-gallery-name）。 */
  onCommit: (next: string) => void;
  /** 展示态渲染：拿到 beginEdit，点它进入编辑（chip 场景由上层决定「已激活才编辑」）。 */
  children: (beginEdit: () => void) => ReactNode;
  inputClassName?: string;
  inputTestId?: string;
  ariaLabel: string;
  maxLength?: number;
}

export function InlineEdit({
  value,
  onCommit,
  children,
  inputClassName,
  inputTestId,
  ariaLabel,
  maxLength = 40,
}: InlineEditProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  // 一次编辑周期只结束一次：Enter 提交后 input 卸载的 blur 不再二次提交。
  const doneRef = useRef(false);

  function beginEdit() {
    setDraft(value);
    doneRef.current = false;
    setEditing(true);
  }

  function finish(save: boolean) {
    if (doneRef.current) return;
    doneRef.current = true;
    setEditing(false);
    if (save) onCommit(draft);
  }

  if (editing) {
    return (
      <input
        className={inputClassName}
        data-testid={inputTestId}
        aria-label={ariaLabel}
        value={draft}
        maxLength={maxLength}
        autoFocus
        // 选中全文，改名时不必先手动清空。
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            finish(true); // 回车即存
          } else if (e.key === 'Escape') {
            e.preventDefault();
            finish(false); // Esc 撤销
          }
        }}
        onBlur={() => finish(true)} // 失焦即存
        // 编辑输入自成一体：指针/点击不冒泡到画布/chip/dock（不触发选中态、拖拽、切场景）。
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  return <>{children(beginEdit)}</>;
}
