# N1-S2 评审证据（reviewer 亲手核查）

sprint：N1-S2（里程碑 N1 · 素材与数据地基 · 回炉第一块）
评审日期：2026-07-16

判尺（唯一）：`.opc/sprints/N1-S2.json` 的 `goal` 字段原文 + `.opc/phase1/milestones.json` 中 `id=="N1"` 条目的 `criteria`（四条）+ `.opc/phase1/taste/taste.json`、`taste/examples/design.md`、`taste/examples/A-旧信.html`/`A2-旧信-沉浸.html` 的「旧信」DNA。四份均已亲手 Read 全文，未采信建造员回执 `receipts/N1-S2/receipt-builder.md` 的转述结论（只拿它定位交付物清单）。

---

## 0. 判尺摘录

milestones.json N1.criteria（S2 相关四条，逐字）：
1. 「生产构建通过：Vite 生产构建成功、无类型错误」——`npm run build` expect_exit 0（180000ms）。
2. 「素材裁切达标：…（含新横版书房图存在且为横向）」——`node scripts/check-asset-trim.mjs` expect_exit 0（60000ms）。
3. 「schema v2 e2e：百分比坐标读写与刷新还原；预置 v1 旧数据启动不崩、按作废处理；故事字段结构保留」——`npx playwright test e2e/n1-foundation.spec.ts --reporter=line` expect_exit 0（120000ms）。
4. 「横版书房图对味：暖调胶片质感与客厅/卧室成一组，还原「旧信」气质」——manual。

N1-S2.json goal 范围提醒（节选）：「contain 居中显示＋同图模糊补边＋窗口缩放钉住相对位置的自适应渲染层是 N2 milestone 的活，本 sprint 不做，只做数据存储格式与素材本体」。

---

## 1. 硬指标①：`npm run build`

亲自在 `/Users/yuriiiz/Projects/Memories` 执行，原样输出（节选）：

```
> memories@0.1.0 build
> tsc -b && vite build

✓ 56 modules transformed.
dist/assets/reading-nook-wide-demo-DcNWv2wV.jpg  1,019.70 kB
dist/assets/living-room-demo-qbHPvBCH.jpg        1,401.06 kB
dist/assets/bedroom-demo-He3QiQOW.jpg            1,405.03 kB
...
✓ built in 397ms
EXIT_CODE=0
```

`tsc -b` 静默通过（无类型错误），`vite build` 成功产出 dist；产物含新横版书房图 `reading-nook-wide-demo-*.jpg`，**旧竖版 `reading-nook-demo-*.jpg` 不在产物列表中**（已确认被替换、不再进生产构建）。**exit 0 达标**。

---

## 2. 硬指标②：`node scripts/check-asset-trim.mjs`

亲自执行，原样输出：

```
素材裁切校验（alpha 阈值=240，四边透明边上限=8px）
file            canvas    margins(t,r,b,l)   entityAR  manifestAR  result
bedroom-1.png   327x396   6,6,0,0            0.8231    0.8231      ✓
...(14 行，全部 ✓，与 N1-S1 阶段实测数值逐位相同)...

横版书房场景图校验（存在性 + 横向朝向）
reading-nook-wide-demo.jpg   3000x2000   ✓ 横向

✓ 全部 14 张物件图达标：四边透明边 ≤8px、清单宽高比与实体一致；横版书房图存在且为横向。
EXIT=0
```

**读源码核实脚本没有偷工减料**（通读 `scripts/check-asset-trim.mjs` 全文）：
- 14 张物件图的校验循环（`ITEM_IDS` 遍历 → `opaqueBounds`/`sideMargins`/`entityAspectRatio` from `lib/trim.mjs`）与 `receipts/N1-S1/receipt-builder.md` 记录的 S1 阶段实现逐字段一致（同一组常量 `ALPHA_SOLID=240`/`MAX_TRANSPARENT_MARGIN=8`、同样从 manifest 源码正则解析 aspectRatio、同样校验条目数=14）；本次实测 14 张的 canvas 尺寸/margins/entityAR 与 N1-S1 receipt 表格逐行数值相同（如 bedroom-1 均为 327x396、margins 6,6,0,0、AR 0.8231）——**14 张 PNG 原有裁边校验逻辑一字未动，物件文件本身也未被本 sprint 二次触碰**。
- 新增部分（第 154-176 行）是独立的追加代码块：内联纯 Node JPEG SOFn 帧头解析（`jpegSize`），只做「`backgrounds/reading-nook-wide-demo.jpg` 是否存在」+「`width > height`」两件事，不涉及/不修改任何 PNG 相关函数，也没有牵动 `backgrounds/` 下 living-room/bedroom 两张的校验（脚本压根不校验这两张，契约本就没要求）。
- 唯一改动的既有代码是收尾的汇总打印文案（第 178-184 行，把「全部 14 张物件图达标」的一句话追加了「横版书房图存在且为横向」的措辞），不影响判定逻辑。

**结论：达标**，且未发现越界或漏改。

---

## 3. 硬指标③：`npx playwright test e2e/n1-foundation.spec.ts --reporter=line`

亲自执行：

```
Running 3 tests using 1 worker
[1/3] ① 百分比坐标读写与刷新还原：placement.x/y 存场景图坐标系百分比，拖动改位后刷新完整还原
[2/3] ② 预置 v1 旧数据启动不崩溃、按作废处理（不迁移、清空重摆，升为 v2 空态）
[3/3] ③ 故事字段结构保留：写故事→刷新还原，Item.story 结构（{id,name,imageSrc,story}）不丢
  3 passed (2.7s)
```

**通读 spec 全文（231 行）逐点核实非空断言**：
- ①（第 98-150 行）：断言 `data-x/data-y` 落在 [0,100]；`localStorage` 里 `schemaVersion===2`、`placements[0].x/y` 与 data-* 一致且落域；**读路径**——渲染出的 `translate(px,px)` 与 `百分比/100 × canvas 宽高` 的误差 <2px（证明百分比→像素换算是真实生效的渲染值，不是摆设字段）；**写路径**——真实 `dragBy` 拖拽后新百分比与初值不同、仍落域、且落盘；**刷新**——reload 后逐字段精确相等（`toBe`，非近似）。三个子链路（存、渲染、刷新）都有断言，非挂羊头。
- ②（第 152-194 行）：预置的 v1 payload 是完整旧结构（`schemaVersion:1`+像素坐标 `x:240,y:180`+场景+故事「旧版故事」），reload 后断言：`scene-chip` 数=0、`placement` 数=0（清空重摆，非部分保留）、`tray-item` 仍 14（物件目录不受影响）、落盘 `schemaVersion` 升为 2、`scenes`/`placements` 长度 0、`activeSceneId` 为 null；同时全程挂 `pageerror`/`console.error` 监听，末尾断言问题数组为空（真正验证「不崩溃」，不是只看页面渲染出来就算数）。
- ③（第 196-230 行）：真实走 `openStoryEditor`→`fill`→`save` 写故事，刷新前后各读一次 `localStorage`，两次都断言 `Object.keys(item).sort()` 精确等于 `['id','imageSrc','name','story']`（结构断言，非只测字符串值）且 `story` 内容原样一致；刷新后额外从故事编辑器 UI 读回一遍复核（不是只信 localStorage）。

三条断言均有实质校验、覆盖点位与 goal 原文三点（百分比读写+刷新还原 / v1 不崩溃按作废处理 / 故事结构保留）逐一对应，**非空断言、非挂羊头卖狗肉**。

**m2/m3/m4 连带适配核查**（读三处改动）：
- `e2e/m2-transform.spec.ts:104-110`：把「拖入落点绝对像素 ±8px」的断言改成「场景图百分比 ±1」的断言，换算公式 `((cbox.width*dropFx - 110/2)/cbox.width)*100` 与 Workbench.tsx 的落点换算逻辑同构；测试仍然覆盖抽屉拖入→拖动改位→缩放→旋转→移除→刷新还原全链路，**断言口径变了但覆盖范围没缩**。
- `e2e/m3-story.spec.ts:126`、`e2e/m4-full.spec.ts:286`：仅把 `schemaVersion).toBe(1)` 改为 `.toBe(2)`，改动点旁自带注释「N1 升 v2：坐标改百分比，故事结构不变」，是 schema 版本号变化的直接推论，非行为改动。
- 实跑 `npx playwright test --reporter=line`（全量 14 条），**14 passed**，m1/m2/m3/m4 四个既有 spec 连同新 n1-foundation 全绿，证明这三处适配没有破坏原有 sprint 的验收范围。

**结论：达标**。

---

## 4. 硬指标④（manual）：横版书房图对味

亲自用 Read 工具直接看图（非只信文件存在）：`backgrounds/reading-nook-wide-demo.jpg`、`backgrounds/living-room-demo.jpg`、`backgrounds/bedroom-demo.jpg`，并额外调出裁切源图 `backgrounds/reading-nook-demo.jpg`（旧竖版）对照。

**目视观察**：
- 新横版书房图：裁自旧竖版下半段——左侧暖木色书架满架彩色书脊，中央/右侧窗台绿植丛，前景芥末黄 + 陶土棕带印花图案的两个窗边坐垫、暖米色坐垫布面。整体画面暖木/奶油/陶土色系占主导（尤其下半幅坐垫区域），符合陶土红强调色的家族气质。
- 客厅图：白墙+灰色沙发+暖木地板+编织坐垫，偏中性明亮，暖色主要来自木地板与零星织物。
- 卧室图：沙漠落日金橙侧光，深色窗帘剪影，全画面暖橙高对比，三张里最明显的「暖调」。

**量化复核**（不只靠肉眼印象，用 Python/PIL 对四张图缩至 100×100 后取平均 RGB 与 R−B 暖度差、通道极差饱和度代理）：

```
reading-nook-wide-demo.jpg   avgRGB=(114.8, 92.4, 68.2)   R-B=46.6   satProxy=52.2
living-room-demo.jpg         avgRGB=(148.4,144.8,137.7)   R-B=10.7   satProxy=13.3
bedroom-demo.jpg             avgRGB=( 60.2, 57.4, 39.6)   R-B=20.6   satProxy=22.6
reading-nook-demo.jpg(源图)  avgRGB=(136.6,122.8,105.2)   R-B=31.4   satProxy=38.0
```

新横版书房图的 R−B 暖度差（46.6）**高于**卧室图（20.6）与客厅图（10.7），也高于其自身裁切来源的旧竖版（31.4）——说明建造员选取的裁切区域（书架下半段+暖色坐垫区）比源图整体更偏暖，是刻意为之而非随手裁一块了事。

**分辨率同量级核查**：`reading-nook-wide-demo.jpg` = 3000×2000，与 `living-room-demo.jpg` 完全同尺寸（3000×2000），与 `bedroom-demo.jpg`（3000×1684）同宽、同量级。达标。

**旧信气质核对**（对照 `taste.json`「暖奶油底＋陶土红＋高对比衬线」与 `design.md`「像翻一封旧信、一本家庭相册——暖、安静、有年代感、耐看」）：新图的旧书、暖木书架、手工印花坐垫等元素属家庭生活痕迹物件，与「家庭相册」的叙事气质相符；陶土色坐垫呼应 `--color-accent` 陶土红家族色。

**如实记录的保留意见（不构成打回理由）**：design.md 全文未对「场景背景照片本身」提出色彩分级/胶片颗粒的工程化要求（唯一相关的是画布层 `--canvas-inset` 暗角，是叠加在任意背景图之上的 CSS 效果，非针对某张图片本身）；三张背景图客观上都是未经额外胶片颗粒/滤镜处理的实景照片，「胶片质感」在 goal 措辞里应理解为「暖旧生活感」的文学化表达，而非要求图片本身带胶片颗粒纹理——这一口径与已通过验收的 M1 视觉标准一致（客厅/卧室两张原图当时即以此标准过审）。新横版书房图不劣于、且暖度实测优于该口径下的既有基准。

**结论：成立（过）**——暖调、与客厅/卧室成一组、旧信气质，三点均有目视+量化证据支持。

---

## 5. SCHEMA_VERSION 与百分比语义核查（非独立硬指标，goal 内文要求）

亲读 `src/storage/persistence.ts`：
- 第 21 行 `export const SCHEMA_VERSION = 2;`——确认为 2。
- `loadState`（第 53-84 行）：`if (parsed.schemaVersion !== SCHEMA_VERSION) return createInitialState();`——版本不匹配（含 v1）直接返回全新初始空状态（`scenes:[]`、`placements:[]`、`activeSceneId:null`），**不做任何字段级迁移/折算**，与 goal「不迁移、直接重置为初始空状态」逐字对应；且 `createInitialState()` 不接触 `localStorage`（读时不落盘，等应用层后续正常写入才升 v2），逻辑简洁无副作用。

亲读 `src/model/types.ts`：`Placement.x/y` 的 JSDoc 明确改为「场景图坐标系内的水平/垂直位置（百分比，相对可视区宽/高；0–100 为区内，可出界）」。

亲读实际换算代码（非只信注释）：
- `src/components/Canvas.tsx` 第 421-422 行渲染时 `pxX=(p.x/100)*stageSize.w`、`pxY=(p.y/100)*stageSize.h`，把持久化百分比转为像素 `translate()`；第 136-139 行 `commitAndEnd` 提交时反向 `xPct=(g.x/g.stageW)*100`，把拖动中的像素基线换算回百分比再 `dispatch`。
- `src/components/Workbench.tsx` 第 40-43 行抽屉拖入的落点同样先算像素再 `(xPx/rect.width)*100` 换算成百分比后才 `dispatch`。
- `src/state/gallery.ts` 第 106-107 行「点选放入」默认网格位改用百分比量级的常量（`12 + n%4*14`、`14 + floor(n/4)*16`），而非旧版的像素量级常量。

四处均是可执行的转换逻辑而非仅注释描述，**坐标系语义确实落到了代码行为上**。

---

## 6. 范围边界核查（N2 越界扫描）

对照 goal 范围提醒「contain 居中显示＋同图模糊补边＋窗口缩放钉住相对位置的自适应渲染层是 N2 milestone 的活，本 sprint 不做」：

- `src/App.css:286-289` `.stage__bg { background-size: cover; ... }`——**仍是 cover，未改 contain**，未实现「contain 居中＋同图模糊补边」。
- `Canvas.tsx` 第 93-96 行行内注释自陈：「本层只做『百分比↔像素』的存/取换算，参照系暂取整块 stage（N2 会把参照系换成 contain 后的场景图矩形）」——代码与注释一致，百分比参照系确实是整块可视区，不是 contain 后的场景图矩形，符合本 sprint「只做数据存储格式」的边界。
- `stageRef`/`ResizeObserver`/`useLayoutEffect` 测量的是可视区尺寸变化后重新计算像素位移（让已有百分比数据在任意视口下都能换算出像素位置），这是百分比存取所必需的最小实现，**不等于**「窗口缩放钉住相对位置的自适应渲染层」——没有做模糊补边、没有做 contain 居中，物件锚定的参照系是拉伸的 stage 盒子而非等比 contain 后的图像矩形，功能边界清晰，未替 N2 抢跑。
- 未发现新增毛玻璃浮层、隐藏界面钮、dock 收合等 N2 才有的 UI 元素（`grep` Workbench.tsx/Canvas.tsx 全文确认无此类新增）。

**结论：无越界**，交付严格卡在「数据存储格式 + 素材本体」的契约范围内。

---

## 结论

四条硬指标逐一亲手核查：

1. `npm run build` exit 0，无类型错误，新横版图正确入产物、旧竖版正确退出产物——**达标**。
2. `node scripts/check-asset-trim.mjs` exit 0；读脚本源码确认 14 张物件 PNG 校验逻辑与 N1-S1 基线逐字段一致（数值也逐行相同）、未被改动；新增校验为独立追加代码，只做新图存在性+横向判定，未误伤既有逻辑——**达标**。
3. `npx playwright test e2e/n1-foundation.spec.ts` exit 0，3 passed；通读 spec 确认三点（百分比读写+刷新还原、v1 作废不崩溃、故事结构保留）均为实质断言非空转；m2/m3/m4 三处连带改动核实为 v2 契约的直接推论、非行为收窄；全量 14 条 e2e 复跑全绿——**达标**。
4. 横版书房图目视+量化双重核实：暖度（R−B=46.6）高于客厅/卧室两张既有基准、分辨率与客厅同量级（3000×2000）、内容元素（暖木书架/陶土坐垫/家庭生活痕迹）契合「旧信」气质——**成立**。

附加核查：`SCHEMA_VERSION=2` 确认、Placement 百分比语义确认落到可执行转换代码（非只改注释）；范围扫描未发现 N2（contain 居中/模糊补边/缩放钉位自适应层）越界实现。

未发现缺项、错项或不达标项。裁决：**放行（pass）**。
