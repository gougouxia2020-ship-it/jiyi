# N2-S1 评审证据 · 满屏沉浸地基 + 场景自适应层

评审员亲手核查记录。范围严格限定在派工给出的【验收硬指标】（8 条）+ 交付物完整性，
不拿 N2 milestone 级验收（e2e/n2-shell.spec.ts，本 sprint 明确不写）或 N2-S2 范围（玻璃四件套 /
拖动让路 / dock 收合 / 字号下限）的标准误伤本 sprint。

必读档案已逐份读全：milestones.json（N2 定义）、success.json（条目2/3/7 与本 sprint 直接相关）、
taste/taste.json（A2「旧信·沉浸」调向结论）、reviewer.md、review-against-criteria.md、
design.md（v1 + v2 增补，`.opc/phase1/taste/examples/design.md`）。

---

## 交付物清单核对

- `src/App.css`（整档重构，满屏外壳 + 场景自适应层 + 浮层最简过渡）—— 存在，已读全文。
- `src/index.css`（body overflow-x→overflow）—— 存在，已读全文。
- `src/components/Canvas.tsx`（补 itemId 类型 + imgRect 坐标换算）—— 存在，已读全文。
- `receipts/N2-S1/receipt-builder.md` —— 存在，已读全文。
- 确认未新增 `e2e/n2-shell.spec.ts`（派工明确本 sprint 不写）：`ls e2e/` 只有
  m1-shell / m2-transform / m3-story / m4-full / n1-foundation 五份，无 n2-shell。符合派工范围。
- 未见 `.opc/` 目录下有被改动的痕迹（未检查具体 diff，因非 git 仓库，但目视 receipt 与代码改动
  均落在 src/ 内，符合"成品全部落在 .opc/ 之外"的自述）。

---

## 逐条核查【验收硬指标】

### 1. 生产构建通过、无类型错误

命令：`npm run build`（cwd 项目根）
结果：exit 0。输出尾部：
```
✓ 56 modules transformed.
...
dist/assets/index-C-17RNXA.css   13.91 kB
dist/assets/index-ClYEzUWp.js   215.23 kB
✓ built in 415ms
```
**判定：过。** 证据：tsc -b 无报错、vite build 成功产出 dist/。

### 2. 场景铺满视口，无定宽留白、无元素堆角、无横向滚动（1280/1920/2560/横屏手机/竖屏）

亲手起 Playwright（`npx playwright test` 走既有 `playwright.config.ts` 的 webServer，即
`npm run dev --port 5178`），用临时脚本（验完即删，未留痕于 e2e/）在 1280×800、1920×1080、
2560×1440、横屏手机 844×390、竖屏 700×1000 五个视口分别建场景、放一件物件，实测：

| 视口 | scrollWidth | clientWidth | .app box (x,y,w,h) | console 错误 |
|---|---|---|---|---|
| 1280×800 | 1280 | 1280 | (0,0,1280,800) | 0 |
| 1920×1080 | 1920 | 1920 | (0,0,1920,1080) | 0 |
| 2560×1440 | 2560 | 2560 | (0,0,2560,1440) | 0 |
| 844×390（横屏手机） | 844 | 844 | (0,0,844,390) | 0 |
| 700×1000（竖屏） | 700 | 700 | (0,0,700,1000) | 0 |

`.app` 矩形与视口逐像素相等、左上角贴 (0,0)——铺满、无留白、无堆角；`scrollWidth==clientWidth`
——零横向滚动；每个视口全程 `console.error`/`pageerror` 均为空数组。

另用真实浏览器截图复核 1920×1080（客厅+2 件物件）与 2560×1440（卧室），肉眼确认：整屏无留白、
无滚动条、浮层（品牌章左上/模式开关右上/物件 dock 左侧/场景条底部居中）位置正确，2560 超宽下
依然铺满无右侧空白。（截图见评审过程留档，未入库。）

**判定：过。**

### 3. 窗口任意拉伸，物件始终钉在房间同一相对位置，无漂移

同一 Playwright 脚本：在 1280×800 建场景、放物件、拖动到新位置，读出存储的 `data-x/data-y/data-w`
为 `{x:28.000000000000004, y:35.25, w:12}`；随后依次切到 1920×1080/2560×1440/844×390/700×1000
五个视口（每次切换后等 150ms 让 ResizeObserver 生效），逐一读取同一 placement 的 `data-x/data-y/data-w`：

```
1280x800: {x:28.000000000000004,y:35.25,w:12}
1920x1080: {x:28.000000000000004,y:35.25,w:12}
2560x1440: {x:28.000000000000004,y:35.25,w:12}
844x390:   {x:28.000000000000004,y:35.25,w:12}
700x1000:  {x:28.000000000000004,y:35.25,w:12}
```
五视口完全一致、零漂移。再切到 1920×1080 后刷新页面，还原值同样为 `{x:28.00,y:35.25}`——
持久化 + 跨视口一致性均成立。

代码层面复核：`Canvas.tsx` 的 `curRect()`/`containRect()` 用 `ResizeObserver` 实时测 stage 尺寸 +
场景图 `onLoad` 读 natural 尺寸算 aspect，`imgRect` 随视口重算；渲染时 `cx = rect.ox + (p.x/100)*rect.iw`
——只要 `p.x/p.y/p.w`（存储的百分比）不变，任何视口下换算出的像素位置都保持"钉在图内同一相对位置"。

**判定：过。**

### 4. 任意比例 contain 居中完整显示、不裁图面（竖图/横图/方图一律成立）

本项风险点：应用内置的 3 张背景（客厅/卧室/书房-横版）经查实测均为横图或近方图
（`sips` 实测：living-room-demo.jpg 3000×2000，bedroom-demo.jpg 3000×1684，
reading-nook-wide-demo.jpg 3000×2000），**没有一张是竖图**——无法直接在 App 内用真实竖图场景
验证"2:3 竖图不裁"这条 success.json 条目 3 点名的 falsify 场景。

为亲手验证而非只信自报，我搭了一个独立最小复现页（未改动本项目任何文件）：把 App.css 里
`.stage`/`.scene-blur`/`.scene-img`/`.stage::after` 的 CSS 规则原文逐字复制到一个孤立 HTML，
背景图换成本仓库 `backgrounds/reading-nook-demo.jpg`（该文件真实存在、2000×3000，是标准 2:3
竖图，是 N1 替换前的旧书房图、现虽未接入 manifest 但物理文件仍在仓库里，像素比例完全符合
"2:3 竖图"这个 falsify 用例），起本地静态服务器加载，分别在宽视口(1900×900)、窄高视口(500×1200)、
方视口(900×900) 下用 `naturalWidth/naturalHeight` + `object-fit:contain` 的标准算法算出应渲染的
图面矩形，并断言该矩形完整落在 stage 内（无出界=无裁切）、且 `.scene-blur` 完全覆盖 stage
（无露底色）。三种视口全部通过：

```
wide 1900x900:  content={x:650,y:0,w:600,h:900}   —— 落在(0,0)-(1900,900)内，图面完整、两侧露出模糊补边
tall 500x1200:  content={x:0,y:225,w:500,h:750}   —— 落在stage内，图面完整、上下露出模糊补边
square 900x900: content={x:150,y:0,w:600,h:900}   —— 落在stage内，图面完整、两侧露出模糊补边
```
并截图肉眼复核（宽视口/窄高视口各一张）：书房窗景+书架完整可见、无一处内容被裁掉，两侧/上下由
同一张图的放大模糊版补满，无纯色底色外露。

补充：`object-fit:contain` 是浏览器原生渲染语义，规范保证"完整显示、按需 letterbox，绝不裁切"，
与图片具体宽高比无关——不是本项目自实现的算法，不存在"某些比例下才裁"的边界风险。Canvas.tsx 里
`containRect()` 与浏览器原生 contain 用的是同一套居中数学（已在指标 3 交叉验证过其正确性）。

**判定：过。**

### 5. 两侧用同图放大模糊版补满（blur≈30px、轻微降亮），不露底色

同一独立复现页 + 实际 App（1440×900，客厅）双重验证：
- `.scene-blur` 的 computed `filter` = `blur(30px) saturate(1.06) brightness(0.9)`——blur 30px、
  降亮（brightness 0.9<1）均在。
- `.scene-blur` 的 boundingBox 在 1440×900 客厅场景下为
  `{x:-104.25,y:-65.16,width:1648.5,height:1030.3}`——四边均超出视口范围（`inset:-4%`+`scale(1.06)`
  外扩生效），完全覆盖 stage，不留缝隙。
- 独立复现页三种极端纵横比（宽/高/方）视口下 `.scene-blur` 边界同样验证 "left/top ≤0 且
  right/bottom ≥ stage 边界"，全部成立（见指标 4 的截图，两侧/上下模糊补边肉眼可见、无纯色露底）。

**判定：过。**

### 6. 画布暗角沿用 --canvas-inset，压在场景层之上、物件层之下

实测（1440×900，客厅场景）：
```
.stage::after 的 computed boxShadow = "rgba(40, 25, 10, 0.35) 0px 0px 90px 0px inset"
```
与 `tokens.css` 里 `--canvas-inset:inset 0 0 90px rgba(40,25,10,.35)` 逐值相等（40,25,10/.35/90px/inset
全部对上）。层序实测：`.scene-blur` z-index=0、`.scene-img` z-index=1、`.stage::after` z-index=2、
`.stage__items` z-index=3——暗角压在场景两层之上、物件层之下，顺序与硬指标要求完全一致。

**判定：过。**

### 7. 坐标改存场景图坐标系百分比 x/y/w，允许出界摆进补边区

localStorage 实测（新建场景+放一件物件后）：
```json
schemaVersion: 3
placement0: {id, sceneId, itemId, x:18, y:24, w:12, rotation:-5, z:1}
```
`model/types.ts` 的 `Placement` 接口注释明确写了坐标语义："x/y = 图内百分比中心位置、w = 占图宽
百分比"，并记录了变更史"v1 像素 → v2 可视区百分比+scale → v3 场景图坐标系百分比 x/y/w（本次）"，
与派工要求的"锚定场景图坐标系的百分比"逐字对应。

出界验证：把物件从画布中央一路拖出 stage 左边界外（鼠标终点 x=-300），实测：
```
拖出后：{x:-31.48, y:24}   —— x 为负，证明落点换算不 clamp
刷新后：{x:-31.48, y:24}   —— 出界值原样持久化还原，不报错
```
代码交叉核对：`onGesturePointerMove` 里 move 分支的 `g.x`/`g.y` 赋值无 `clamp()` 调用（对比 scale
分支显式调用 `clamp(...,MIN_W,MAX_W)`），与"允许坐标出界"要求一致。

**判定：过。**

### 8. 无未捕获运行时错误

指标 2 的五视口测试全程收集 `console.error` 与 `pageerror` 事件，五个视口均为空数组
（见指标 2 表格"console 错误"列全 0）。指标 3/7 的交互测试（拖动、缩放、刷新）过程中同样未见
额外报错。

**判定：过。**

---

## 交叉验证：未被本 sprint 硬指标覆盖、但值得记录在案的观察

不影响上面 8 条的裁决，但作为"亲手核查、证据说话"的一部分如实记录：

1. **`e2e/n1-foundation.spec.ts` 3 条现红**——与建造员回执披露一致。跑了一遍确认：全部败在
   `expect(stored.schemaVersion).toBe(2)`（现为 3）。该 spec 自己的头注释写明"本 sprint（N1）只做
   数据存储格式与素材本体；contain 居中＋模糊补边＋缩放钉位的自适应层是 N2 的活"——即 N1 自己承认
   其 v2 语义是过渡态，v3（本 sprint 硬指标点名的"锚定场景图坐标系"）取代它是预期演进，不是本 sprint
   引入的回归。建造员回执如实披露了这 3 条。

2. **额外发现（建造员回执未披露）**：完整跑了一遍 `e2e/m1~m4` 全部既有套件（建造员回执只字未提
   这几份），发现 **另有 6 条现红**：
   - `m2-transform.spec.ts` 2 条：一条断言 `data-scale` 属性与"画布内百分比"（非图内百分比）,
     另一条断言"拖到报头区域(画布之外)不建 placement"。
   - `m3-story.spec.ts` 1 条：断言 `schemaVersion===2`。
   - `m4-full.spec.ts` 3 条（PC/768px/375px 三视口各一）：断言 `data-scale` 递增。

   查证根因：`model/types.ts` 注释自述"v2 可视区百分比+**scale 倍率** → v3 场景图坐标系百分比
   **x/y/w**（本次）"——`scale` 字段本 sprint 被 `w`（图宽百分比）取代，这是派工"物件坐标锚定场景图
   坐标系百分比"本身要求的必然结果（否则窗口缩放时物件没法跟着房间等比变大变小，success.json
   条目2 的"物件与房间同一相对位置"若要求连大小都同步会隐含需要这个改动）；m2-transform 第二条
   （报头区域不建 placement）失败是因为 `.top` 报头容器 `pointer-events:none`、只有 `.brand`/`.seg`
   两个子块可点，报头空白处的指针事件现在穿透到下层铺满视口的 `.stage`——这正是设计文档 v2 增补里
   "拖动让路铁律"要解决的问题，而该铁律派工已明确写"留给 N2-S2"。两类根因都可追到"本 sprint 明确
   要做的 schema 演进"或"明确留给 N2-S2 的机制"，不是建造员随手引入的独立新 bug。

   但建造员回执的"已知事项"只披露了 n1-foundation 的 3 条，未提这另外 6 条——**自检的完整性有
   缺口**：既然已经意识到 schema 演进会让旧 spec 现红并主动解释了 n1-foundation，理应用同一逻辑
   顺手跑一遍 m1-m4（已完工里程碑的回归套件）并一并披露，而不是只挑了派工上下文点名的那一份。
   这不构成对本 sprint 8 条硬指标的违反（8 条逐条核查均过），**不作为打回理由**，但作为证据留档，
   供后续 sprint（尤其是要写 e2e/n2-shell.spec.ts 的那一轮）知悉：m2/m3/m4 的旧 e2e 断言需要跟着
   schema v3 与"拖动让路"机制一并翻新，否则会一直是红的。

3. **视觉复核**：1920×1080（客厅+2物）、2560×1440（卧室）、844×390（书房横屏手机）三张截图肉眼
   确认——暖奶油浮层、陶土红强调色、衬线品牌名、模式开关正确高亮当前模式（2560 截图确认默认
   "编辑"高亮，与 `persistence.ts` 默认 `mode:'edit'` 一致）、暗角均在，"旧信·沉浸"气质在位。
   浮层为最简过渡态（暖奶油纸底、非毛玻璃）——回执如实标注"不做玻璃四件套"，与派工范围一致，
   不按 N2-S2 的毛玻璃标准要求本 sprint。

---

## 总裁决

8 条【验收硬指标】逐条亲手核查，证据齐全，**全部过**。交付物路径与自述一致、未越界碰 .opc/。
receipt-builder.md 的"已知事项"披露基本诚实但不完整（漏报 m2/m3/m4 共 6 条现红，见上文观察 2），
该缺口已记录在案、供团队知悉，但因不违反本 sprint 给定的任何一条硬指标、且根因均可追溯到本
sprint 明确要做的改动或明确后置的机制，故不构成打回理由。

**裁决：pass。**
