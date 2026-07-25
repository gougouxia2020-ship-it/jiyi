// 报头浮层（N2-S2·浮层玻璃四件套之一、二）：
//  - 品牌章（左上）：衬线陈列室名，毛玻璃浮块（.brand.chrome.glass）。
//  - 右上控件组（.ctl）：模式开关（编辑/游客）＋隐藏界面钮（眼睛）。两者各自独立浮块，
//    均为毛玻璃；隐藏界面钮带 .eye-keeper——「隐藏界面」时其余浮层收干净、唯它留一枚幽灵钮可恢复。
// 拖动让路 / 隐藏界面由父层在 .app 上挂 .is-dragging / .ui-hidden 类统一驱动（见 App.css）：
// 每个浮块带 .chrome，父类命中即整体淡出让路 / 收起，眼睛靠 .eye-keeper 豁免收起。
import type { Mode } from '../model/types';
import { InlineEdit } from './InlineEdit';

interface HeaderProps {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  /** 陈列室名（品牌章）——就地编辑，随状态持久化。 */
  galleryName: string;
  onRenameGallery: (name: string) => void;
  /** 隐藏界面：true=浮层已收起、纯看房间（唯留眼睛幽灵钮）。 */
  uiHidden: boolean;
  onToggleUi: () => void;
}

export function Header({
  mode,
  onModeChange,
  galleryName,
  onRenameGallery,
  uiHidden,
  onToggleUi,
}: HeaderProps) {
  return (
    <header className="top" data-testid="header">
      <div className="brand chrome glass" data-testid="brand">
        {/* 陈列室名（N3 就地编辑）：仅编辑模式可改——点标题进入编辑、回车/失焦即存。
            U3-S2·游客只读复核：游客模式下陈列室名是「重命名入口」/可改数据，必须收起——
            渲染为纯展示 <h1>（无 role=button / onClick / tabIndex），点它不进入编辑、不可改名。 */}
        {mode === 'edit' ? (
          <InlineEdit
            value={galleryName}
            onCommit={onRenameGallery}
            inputClassName="brand__name-input"
            inputTestId="gallery-name-input"
            ariaLabel="重命名陈列室"
          >
            {(beginEdit) => (
              <h1
                className="brand__name"
                data-testid="gallery-name"
                role="button"
                tabIndex={0}
                title="点一下改陈列室名"
                onClick={beginEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    beginEdit();
                  }
                }}
              >
                {galleryName}
              </h1>
            )}
          </InlineEdit>
        ) : (
          <h1 className="brand__name" data-testid="gallery-name">
            {galleryName}
          </h1>
        )}
        <small>Memory Gallery</small>
      </div>

      <div className="ctl">
        {/* 模式开关（编辑/游客）——E1-S2·游客不可逆守卫：整组仅在**编辑模式**渲染。
            游客模式下此组彻底不挂载——不是 disabled、不是 CSS 隐藏，而是根本不进组件树（DOM 里找不到、
            点不到），故访客无从点「编辑」把自己切回编辑模式，上传/删除/重命名等入口也随之无从解锁。
            唯一能从游客切回编辑模式的路径，是 App 顶层那条不显眼的 URL 参数（?edit）——供开发/老板
            预览完游客视图后切回用；除此之外访客无路可回。编辑模式下本组照常渲染（老板由「游客」钮进预览）。 */}
        {mode === 'edit' && (
          <div className="seg chrome glass" role="group" aria-label="模式开关">
            {/* 本组只在编辑模式渲染，故此处 mode 恒为 'edit'：编辑段恒激活、游客段恒未激活。 */}
            <button
              type="button"
              className="on"
              aria-pressed={true}
              data-testid="mode-edit"
              onClick={() => onModeChange('edit')}
            >
              编辑
            </button>
            <button
              type="button"
              className=""
              aria-pressed={false}
              data-testid="mode-guest"
              onClick={() => onModeChange('guest')}
            >
              游客
            </button>
          </div>
        )}

        {/* 隐藏界面钮（眼睛）：一键收起全部浮层纯看房间；再点恢复。收起态自身留作幽灵钮。 */}
        <button
          type="button"
          className="eye chrome glass eye-keeper"
          data-testid="toggle-ui"
          aria-pressed={uiHidden}
          title={uiHidden ? '显示界面' : '隐藏界面，纯看房间'}
          aria-label={uiHidden ? '显示界面' : '隐藏界面'}
          onClick={onToggleUi}
        >
          {uiHidden ? (
            // 眼睛·闭（隐藏态）
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20C5 20 1 12 1 12a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
              <path d="M1 1l22 22" />
            </svg>
          ) : (
            // 眼睛·开（可见态）
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>
    </header>
  );
}
