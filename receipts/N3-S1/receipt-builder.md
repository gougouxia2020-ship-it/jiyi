# N3-S1 建造回执 · Canva 式手柄与编辑全链路（建造员）

sprint：N3-S1 ｜ 里程碑：N3 ｜ 团队：general ｜ 日期：2026-07-17

## 一、任务范围（照契约，不增不减）
`.opc/sprints/N3-S1.json` 的 goal：把变换手柄换成 Canva 风格，并让 dock 拖出→挪位→缩放→旋转→移除→写故事这条编辑全链路在新手柄上跑通、持久化正确。**本 sprint 不做**场景/物件重命名与删除、不做陈列室名就地编辑（留 N3-S2）；**不跑** e2e/n3-edit.spec.ts 全量（milestone 级验收留收口 sprint）。

## 二、改了哪些文件
- `src/components/Canvas.tsx` —— 选中态 chrome 重构 + 三枚真 SVG 图标组件。
- `src/App.css` —— 手柄 v2 全套样式（选框/圆点/旋转钮/玻璃工具条）+ 退掉窄屏放大规则 + 注释更新。
- （`src/styles/tokens.css` 未改：v2 token `--h2-*`/`--sel-line`/`--glass-*` 已就位，直接引用。）
- （`.opc/` 全程未碰——禁区。）

## 三、逐条对齐【验收硬指标】

### 1. 选中态 = 陶土红细选框 + 四角白圆点 + 选框正下方旋转圆钮（真 SVG）
- `.stage__frame`：`inset:-3px` + `border:1.5px solid var(--sel-line)`（陶土红）+ 极淡白描边/柔投影（对齐 A2 demo，深浅背景都读得清）。挂 `.stage__tf` 内，随物件旋转/缩放一起走；`pointer-events:none`（不拦指针，物件中心可拖）。
- `.stage__handle`（四角）：`width/height:var(--h2-size)`（13px 白圆点）、`background:var(--h2-bg)`、`border:1px solid var(--h2-line)`、`box-shadow:var(--h2-shadow)`、`border-radius:50%`。四角定位沿用 tl/tr/bl/br 的 translate 偏移，圆点等比缩放随选框走。`data-testid="handle-scale"` × 4、`data-corner` 保留（复用 M2 缩放手势入口，未动手势逻辑）。
- `.stage__rot`（旋转圆钮）：从 v1 的「顶部杆 + ⟳ 字符」改为**选框正下方**（`top:100%; margin-top:12px`）26px 白圆钮，内嵌真旋转图标 SVG（环形箭头 `<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>`）。`data-testid="handle-rotate"` 保留。删除了 `.stage__stem`（demo 无连接杆）。
- 字符 ⟳ 已清零（自检断言 handle-rotate innerHTML 含 `<svg>`、不含 `⟳`）。

### 2. 「故事」「删除」收进选中时浮出的毛玻璃小工具条（真 SVG，恒水平，悬于选框上方）
- 新增 `.stage__toolbar`：玻璃材质（`--glass-bg`/`--glass-line`/`backdrop-filter:blur(--glass-blur)`/`--shadow-glass`）、胶囊形、`bottom:100%; margin-bottom:12px`（悬选框上方）。内含铅笔 SVG（写故事，`placement-story`）+ 分隔条 + 垃圾桶 SVG（移除，`placement-remove`），并预留 `gap`/`.stage__toolbar-div` 结构，后续加置顶/复制按钮即插即用。
- **恒水平的关键架构决策**：工具条挂在 `.stage__item`（**位移层**，只 translate 不 rotate/scale），是 `.stage__tf` 的**兄弟**而非子——故物件旋转/缩放时工具条不跟着转，永远水平。同时它仍是 `.stage__item[data-item-id]` 的后代，`item.locator('[data-testid="placement-story"]')` 这类既有定位器照旧命中（M3/M4/N1 的故事入口写法不破）。
- **让路**：任一手势进行中（`active===p.id`）给工具条挂 `.is-hidden`（opacity:0 + pointer-events:none）；松手 commit 后重渲染，工具条按新位置浮回。避免旋转/缩放中工具条「悬在半空不动」的违和。
- 字符 ✎/× 已清零（自检断言 placement-story/placement-remove innerHTML 含 `<svg>`；`.stage__items` innerText 不含 `⟳✎×`）。

### 3. 触摸命中区一律 ≥ --h2-hit（26px，视觉尺寸不放大）
- 圆点视觉恒 `--h2-size`(13px)，命中区靠 `.stage__handle::after` 透明伪元素撑到 `--h2-hit`(26px)、居中罩住圆点——可点范围放大、可见圆点不放大。自检实测：`.stage__handle--br` 可见宽 ≤16px、`::after` 计算尺寸 = 26px×26px。
- 旋转钮本体 26px、工具条按钮 32px，均 ≥ `--h2-hit`，无需 `::after`。
- **退掉** App.css 窄屏（≤880px）里「把 `.stage__handle/.stage__rot` 放大到 `--handle-hit`」的旧规则——v2 口径是「命中区不放大视觉」，各视口统一由 `::after` 通吃。

### 4. 全链路可用 + 持久化还原
自检 e2e（临时 spec，跑通后已删）驱动真实指针：dock 拖入→挪位（x/y 变、w/rotation 不变）→角手柄缩放（w 变大、x/y/rotation 不变）→旋转钮旋转（rotation 变、x/y/w 不变）→工具条移除（B 物件删除，placement 计数 2→1）→写故事（工具条铅笔弹弹窗、保存）→刷新：A 的 placement(x,y,w,rotation,z) 逐字段 `toEqual` 还原、故事 LocalStorage 读回一致。全程无 console 错误 / pageerror。
- **未破坏持久化**：完全没动数据模型（`types.ts`）、reducer（`gallery.ts`）、存储（`persistence.ts`）、手势换算（Canvas 的 pointer 逻辑 / rAF 提交路径）。只改了 chrome 的 DOM 结构与样式。

## 四、自检结果
- `npm run build`：**过**（tsc -b + vite build，无类型错误）。
- `npx playwright test e2e/n2-shell.spec.ts`：**全绿**（8 用例 / 14 项含多视口变体全过）——满屏外壳与让路无回归。
- `npx playwright test e2e/m2-transform.spec.ts`：2 failed —— **与我改动前的基线完全一致（预存在红）**。首个用例在第 109 行「落点像素坐标断言」即挂，那是 N1 把坐标改成场景图坐标系百分比（`data-scale`→`data-w`、落点算法换参照系）留下的历史回归，**在触碰任何手柄前就失败**，与本 sprint 无关；第二个用例（落画布外不建 placement）是 N2 满屏「任意位置皆可落」改了行为所致。二者均非我引入，且 m2-transform 非本轮验收门（milestone 级 n3-edit.spec.ts 由 N3-S2 补齐）。
- 临时自检 spec（Canva 手柄结构 + 全链路 + 刷新还原）：**1 passed**，跑通即删（`e2e/_tmp-*.spec.ts`、截图 `_n3-handles.png`、`test-results/` 均已清理，不留垃圾进仓）。
- 视觉截图核对（1280×800，客厅场景选中「全家福旧照」）：陶土红细选框 + 四角白圆点 + 下方旋转 SVG 圆钮 + 上方水平玻璃工具条（铅笔/垃圾桶）齐备，与 `A2-旧信-沉浸.html` 观感一致，无字符图标残留。

## 五、架构性判断（自决，未中途提问）
1. **工具条挂位移层而非旋转层**：为同时满足「恒水平」与「既有 `item.locator(...)` 定位器不破」，选择让工具条做 `.stage__item` 的直接子、`.stage__tf` 的兄弟。取舍掉了「像 demo 那样把工具条挂 stage 根、用 JS 手动定位」的方案——后者要额外跟踪几何、拖动中还要 rAF 重定位，复杂且易与 React 渲染打架；挂位移层则天然随 translate 走、零额外定位代码。
2. **旋转钮下移到选框正下方**：契约与 design.md v2 明确要求「选框正下方旋转圆钮」，故从 v1 的顶部改到底部。已核 M2/M4 的旋转手势断言只看「rotation 是否变化」，与钮的位置无关；且这两条用例本就因 N1/N2 历史改动而红，不受影响。
3. **命中区用 `::after` 而非放大元素**：严格照「视觉尺寸不放大」，用透明伪元素扩命中区，并据此退掉窄屏放大规则，保证三视口一致。

## 六、留给下一棒（N3-S2）的接口
- 工具条 `.stage__toolbar` 已留 `gap` 与 `.stage__toolbar-div` 结构，加「置顶/复制」等只需在 story/remove 之间插 `<button class="stage__toolbar-btn" data-testid="...">` + SVG。
- 手柄/工具条全部 testid 稳定（handle-scale×4/handle-rotate/placement-story/placement-remove/placement-toolbar），N3-S2 写 n3-edit.spec.ts 可直接依赖。
