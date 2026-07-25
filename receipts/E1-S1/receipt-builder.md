# receipt · E1-S1 · 建造员自检

Sprint：E1-S1 —— 首拖卡死修复（拖拽幽灵 portal 逃逸 + window 级松手兜底 + 落点换算不依赖背景图 onLoad）
＋ hydrate 未回填图物件不可拖/不可摆 ＋ objectURL 删除/换图后 revoke（补内存泄漏）。
本 sprint **不含**游客模式堵漏（留给 E1-S2）——故未动 Header 的模式开关渲染逻辑。

## 一、验收硬指标逐条自检

### 硬指标 1（自动）：`npx playwright test e2e/e1-hydrate.spec.ts --reporter=line` exit 0
- 状态：**过**。新建 `e2e/e1-hydrate.spec.ts`，2 条用例全绿（2 passed, 2.3s）。
- 覆盖点：
  - ① hydrate 未回填图的用户件不可拖、不可摆——灌一份「刷新后待 hydrate」持久化态（user 件
    `imageRef` 指向 IndexedDB 里**不存在**的键 → hydrate 取不到图 → 稳定停在未回填态）；断言该缩略卡
    `data-ready="false"`、`aria-disabled="true"`；模拟拖拽进画布 → 无跟手幽灵挂载、松手后 `placement`
    数为 0（不会摆出看不见的物件）；点选它同样不摆出；对照一件 ready 的内置件仍能正常拖入、拖动时
    幽灵可见、产出 1 条 placement（证明拦的是「未回填」态而非拖拽系统坏了）。
  - ② 删除用户件后其 objectURL 被 revoke——先把真实图片二进制灌进 IndexedDB，灌持久化态后 reload 触发
    真实 hydrate（生成 blob: objectURL 回填缩略）；用 `addInitScript` 在页内劫持 `URL.revokeObjectURL`
    记录被 revoke 的 URL；删除该件后轮询断言其 blob URL 已进入被 revoke 列表。删除前断言尚未被 revoke。
  - 全程 `watchErrors`：无 pageerror / 无 console.error / 无未处理 Promise 拒绝。

### 硬指标 2（自动）：`npm run build` exit 0
- 状态：**过**。`tsc -b && vite build` 成功，无类型错误，64 modules transformed，built in ~370ms。

### 硬指标 3（人工·老板亲验，建造员须亲手走一遍自检）：首次拖拽即可用
- 状态：**过（建造员自检）**。起 Vite dev（:5199）用 claude-in-chrome 在真实 Chrome 里实操：
  - 拖拽幽灵经 `createPortal` 挂在 `document.body`（`ghost.parentElement === body`、
    `ghost.closest('[data-testid="tray"]') === null`）——**逃出了 dock 的 transform + overflow:hidden
    裁剪**，这正是首拖卡死的根因。
  - 幽灵全程跟指针走：读 DOM 实测 `ghost_center === 指针坐标`（如 (1445,368) 与目标 (1445,368) 完全一致），
    88×107px、opacity 0.9、visibility visible、图片已解码；拖动时 `.app.is-dragging` 命中、chrome 让路
    （dock/header 淡出）。
  - 松手落在松手处：连续两次拖放，placement 中心 (1720,612)/(1445,368) 与各自 drop 目标逐一吻合；
    界面不卡死、多次表现一致。
  - 说明：本地会话背景图已缓存，未能现场复刻「趁背景图没加载完」这一刻；该点由代码层解决——新增
    `src/assets/backgroundAspect.ts` 在模块加载即预解码全部内置背景、缓存固有宽高比，落点换算
    （Workbench）与画布渲染（Canvas）都优先读这份「已知宽高比」，**不再退化成 stage 比例**，消除
    「首拖落点跑偏/落进补边区、只卡第一次」。

### 硬指标 4（人工·老板亲验，建造员须亲手走一遍自检）：拖出窗口外再回来能自愈
- 状态：**过（建造员自检）**。同上实操：
  - 起一次拖拽（`is-dragging` true、幽灵挂载），随后向 **window** 派发一个坐标在视口外 (-400,-300) 的
    `pointerup`（模拟在浏览器窗口外松手）→ `is-dragging` 复位为 false、幽灵卸载、**未产出任何幻影
    placement**（落点越界被 `handleDropItemAt` 的边界判断拒绝，不落进补边/窗外）。
  - 恢复后界面可正常操作、无需刷新：dock/header opacity 回到 1、dock `pointer-events:auto`，点选一个
    placement 即出现 4 个缩放手柄 + 工具条——交互全部复活。
  - 额外印证：先前一次被中断的拖拽（脚本因后台标签页 rAF 暂停而挂起、留下 `.is-dragging` 悬挂）随后
    被一发 window `pointercancel` 兜底清掉——真实展示了「任何异常松手路径都能复位」。

## 二、改动清单（成品均在 .opc/ 之外）

- `src/components/ItemTray.tsx`（拖拽幽灵与松手兜底的主战场）
  - 幽灵改走 `createPortal(..., document.body)` 逃出 dock 的 transform+overflow 裁剪（核心修复）。
  - 抽出 `finalizeRef`（happy path 的元素松手与 window 兜底共用一套复位逻辑）：先摘 dragRef 防重复收拾，
    再按 commit 落点/点选或纯复位，任何路径都保证 `.is-dragging` 复位、幽灵卸载、rAF/指针捕获收干净。
  - 新增 `useEffect` 挂 window 级 `pointerup` / `pointercancel` / `pointermove(buttons===0)` / `blur` 兜底：
    setPointerCapture 失败、窗口外松手、切标签页等异常路径都能复位拖拽态（不必刷新）。
  - 新增 `isItemReady(item)=!!item.imageSrc`：hydrate 未回填图的用户件 `onPointerDown` 直接不起手（不可拖、
    不可摆）；缩略卡加 `data-ready`、`aria-disabled` 随之调整、标题提示「图片加载中」。
- `src/assets/backgroundAspect.ts`（**新增**）
  - 模块加载即预解码内置背景、缓存固有宽高比；`knownBackgroundAspect()` / `recordBackgroundAspect()`。
- `src/components/Workbench.tsx`
  - `handleDropItemAt` 落点换算 aspect：可见 `<img>` naturalWidth → `knownBackgroundAspect` → 最后才兜底
    stage 比例；**不再在背景未加载时退化成 stage 比例**。
- `src/components/Canvas.tsx`
  - `sceneAspect` 初值/切背景时优先取 `knownBackgroundAspect`（首帧就按真实 imgRect 摆放，不闪一帧
    stage 比例）；scene-img `onLoad` 回喂 `recordBackgroundAspect`。
- `src/App.tsx`（objectURL 生命周期唯一 owner，补内存泄漏）
  - 新增 `objectUrlsRef` 登记表；hydrate 生成 blob URL 时登记（重复回填先 revoke 旧的）。
  - 新增 reconcile `useEffect([state.items])`：Item 被删除 / imageSrc 换图后，revoke 旧 URL 并出表。
  - 新增卸载 `useEffect`：离开页面时把登记表里剩余 URL 全部 revoke。
- `e2e/e1-hydrate.spec.ts`（**新增**）：见硬指标 1。

## 三、跑测试输出摘要

- `npm run build`：exit 0；`✓ 64 modules transformed`，`✓ built in ~370ms`，无 tsc 类型错误。
- `npx playwright test e2e/e1-hydrate.spec.ts --reporter=line`：`2 passed (2.3s)`。
- `npx playwright test --reporter=line`（全量回归自检，非本 sprint 硬指标但避免拖累后续）：
  `59 passed (1.0m)`——含本 sprint 新增 2 条，M1~M4 / N1~N4 / U1~U4 既有套件全绿、零回归。

## 四、结论（自检）

对照 E1-S1 四条硬指标逐条走完：两条自动（e1-hydrate、build）实测 exit 0、绿；两条人工（首拖即用、
窗口外松手自愈）在真实浏览器实操走过、DOM 实测印证幽灵 portal 逃逸+跟手、落点吻合、异常松手复位、
UI 无需刷新即恢复。自判「我认为做完了」；是否终验通过由评审员/老板裁决。
