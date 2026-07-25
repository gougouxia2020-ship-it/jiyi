# N1-S1 评审证据（reviewer 亲手核查）

sprint：N1-S1（里程碑 N1 · 素材与数据地基 · 回炉第一块）
评审日期：2026-07-16

判尺（唯一）：`.opc/sprints/N1-S1.json` 的 `goal` 字段原文 + `.opc/phase1/milestones.json` 中 `id=="N1"` 条目的 `goal`/`criteria`。已亲手 Read 两份文件，未采信建造员回执转述。

---

## 0. 判尺摘录（我自己读到的原文，用于对照）

N1-S1.json goal（节选）：
> 一次性写脚本按 alpha 阈值（忽略烘焙半透明软阴影）识别真实不透明像素包围盒，把 items/ 目录下 14 张物件 PNG 的透明留白裁到四边 ≤8px 呼吸边、原地替换文件；同时写校验脚本 scripts/check-asset-trim.mjs 逐张测量裁剪结果是否达标；素材清单 src/assets/manifest.ts 的物件条目补充宽高比字段，值与裁剪后图片的真实实体宽高比一致。本 sprint 只处理已有 14 张物件图，新增的横版书房场景图由 S2 负责，check-asset-trim.mjs 里横版书房图的存在性/朝向校验也留给 S2 补充，S1 的脚本只需覆盖 14 张物件图这部分并 exit 0。…idea.json 原文点出的问题：「14 张物件 PNG 带大片透明边…且部分图烘焙了半透明软阴影把实体比例撑歪（复古闹钟实为竖向），选中框比实物大一圈、标注宽度虚高」——裁剪与宽高比标注必须解决这两个问题，阴影不算实体。

milestones.json N1.criteria（与 S1 相关的两条）：
1. 生产构建通过：`npm run build` expect_exit 0。
2. 素材裁切达标：`node scripts/check-asset-trim.mjs` expect_exit 0，逐张测 14 张物件 PNG，四边透明边 ≤8px、清单标注宽高比与实体一致（横版书房图部分明确划给 S2，本轮不判）。

（schema v2 e2e、横版书房图对味两条属 N1 milestone 但不属 N1-S1.json 声明的范围，S1 不判。）

---

## 1. 硬指标命令：`node scripts/check-asset-trim.mjs`

亲自在 `/Users/yuriiiz/Projects/Memories`（cwd）下执行，原样输出：

```
素材裁切校验（alpha 阈值=240，四边透明边上限=8px）

file            canvas    margins(t,r,b,l)   entityAR  manifestAR  result
bedroom-1.png   327x396   6,6,0,0            0.8231    0.8231      ✓
bedroom-2.png   309x282   6,0,0,6            1.0978    1.0978      ✓
bedroom-3.png   442x306   6,6,6,6            1.4626    1.4626      ✓
bedroom-4.png   209x389   6,6,6,6            0.5225    0.5225      ✓
bedroom-5.png   242x121   6,6,6,6            2.1101    2.1101      ✓
bedroom-6.png   201x273   6,6,6,6            0.7241    0.7241      ✓
living-1.png    176x200   6,6,6,6            0.8723    0.8723      ✓
living-2.png    193x353   6,0,6,6            0.5216    0.5216      ✓
living-3.png    202x282   6,0,6,6            0.7259    0.7259      ✓
living-4.png    418x226   6,6,6,6            1.8972    1.8972      ✓
living-5.png    145x224   6,6,6,6            0.6274    0.6274      ✓
living-6.png    185x203   6,6,6,6            0.9058    0.9058      ✓
living-7.png    157x247   6,6,6,6            0.617     0.617       ✓
living-8.png    245x231   6,6,6,6            1.0639    1.0639      ✓

✓ 全部 14 张物件图达标：四边透明边 ≤8px、清单宽高比与实体一致。
EXIT_CODE=0
```

**读懂脚本到底测了什么**（亲读 `scripts/check-asset-trim.mjs` + `scripts/lib/trim.mjs` 源码，非转述）：
- `opaqueBounds`：逐像素扫 alpha ≥ `ALPHA_SOLID(240)` 的点，求包围盒——阈值定得高（240/255），烘焙软阴影/羽化边/鬼影（多落在 alpha ≤180 甚至更低）不计入包围盒，符合 goal「忽略烘焙半透明软阴影」的要求。
- `sideMargins`：包围盒到画布四边的像素数，即“透明边”。
- `entityAspectRatio`：包围盒宽/高，四位小数，即“真实实体宽高比”（不含呼吸边）。
- 脚本从 `manifest.ts` 源码用正则抽取每条 `aspectRatio`（因是纯 node 脚本，不能直接 import 带资源导入的 .ts），与实测 `entityAspectRatio` 比对，容差 0.01。
- 额外校验 `manifest` 里带 `aspectRatio` 的条目数=14，防漏标/多标。
- 全部 14 张四边 margin ≤8（实测都是 6 或以下）且 AR 与 manifest 一致 → exit 0；否则 exit 1。逻辑与 goal 硬指标逐字对应，未发现偷工减料（比如没有把某几张跳过判定、没有放宽容差）。

## 2. 独立复核（不依赖建造员自写的 png.mjs 解码器）

用系统自带 Python3 + PIL（`/opt/homebrew/bin/python3`，非项目依赖，独立于建造员代码）重新对 14 张图逐像素扫描 alpha≥240 求包围盒、四边留白、AR，脚本存于 `/private/tmp/.../scratchpad/verify2.py`。输出：

```
file            canvas     t,r,b,l          entAR     manifestAR  maxMargin result
bedroom-1       327x396    6,6,0,0          0.8231    0.8231      6         OK
bedroom-2       309x282    6,0,0,6          1.0978    1.0978      6         OK
bedroom-3       442x306    6,6,6,6          1.4626    1.4626      6         OK
bedroom-4       209x389    6,6,6,6          0.5225    0.5225      6         OK
bedroom-5       242x121    6,6,6,6          2.1101    2.1101      6         OK
bedroom-6       201x273    6,6,6,6          0.7241    0.7241      6         OK
living-1        176x200    6,6,6,6          0.8723    0.8723      6         OK
living-2        193x353    6,0,6,6          0.5216    0.5216      6         OK
living-3        202x282    6,0,6,6          0.7259    0.7259      6         OK
living-4        418x226    6,6,6,6          1.8972    1.8972      6         OK
living-5        145x224    6,6,6,6          0.6274    0.6274      6         OK
living-6        185x203    6,6,6,6          0.9058    0.9058      6         OK
living-7        157x247    6,6,6,6          0.617     0.617       6         OK
living-8        245x231    6,6,6,6          1.0639    1.0639      6         OK

ALL OK
```

**结论**：与建造员的 check 脚本输出逐位一致（画布尺寸、四边 margin、entityAR、与 manifest 的 AR 均相同）。两套独立实现（建造员自写 PNG 解码器 vs PIL 库）互相印证，排除了“脚本自己骗自己”的可能——不是同一套代码在自证自己没错。四边最大留白均为 6px，在 ≤8px 硬指标内有余量（非贴着上限压线）。manifest 标注 AR 与实测完全吻合（非近似达标）。

## 3. 目视抽查（Read 工具直接看图，非信任数值）

抽查 8/14 张（含 idea.json 点名的复古闹钟、有较浓阴影/鬼影的几张、边界 margin=0 的几张）：

| 文件 | 关注点 | 观察 |
|---|---|---|
| items/bedroom-6.png | idea.json 点名「复古闹钟实为竖向」 | 201x273（宽<高），图中粉色双铃闹钟紧贴裁边，确认是竖向构图，无横向撑大痕迹。**该具体问题已解决**。 |
| items/living-1.png | 「选中框比实物大一圈」的举证图 | 176x200，黑色相机镜头紧贴裁边，未见半透明鬼影机身残留。 |
| items/bedroom-5.png | 烘焙阴影较浓（回执自述） | 242x121，仅留最下方实心书脊，未见淡化的鬼影书页/倒影。 |
| items/living-6.png | 反光/支架虚影 | 185x203，仅留球体本身，右下角未见虚影残留。 |
| items/bedroom-1.png | margin 6,6,0,0（左/下贴边） | 全家福照片+画框架，左下角本就贴着画面边缘，非过度裁切导致截断主体。 |
| items/living-3.png | margin 6,0,6,6（右贴边） | 老式收音机，右边缘紧贴，属原始素材构图，非误裁。 |
| items/bedroom-3.png | 有阴影举证 | 复古毡帽，裁边干净，未见残留晕影。 |
| items/living-4.png | AR=1.8972 最宽之一 | 黄色甲壳虫车，横向宽幅框住车身，构图合理。 |

8 张全部裁边紧贴实体、无残缺主体、无残留大片阴影/鬼影，与数值结果一致。

## 4. manifest.ts 宽高比核对

亲读 `src/assets/manifest.ts`：`ItemAsset` 接口新增 `aspectRatio: number` 字段（含 JSDoc 说明来源与用途）；`ITEMS` 数组 14 条全部补了值。逐条与本人第 2 节独立算出的 entityAR 比对（见上表 manifestAR 列 vs 第2节 entAR 列），**14/14 完全一致**，非近似。

## 5. 硬指标命令：`npm run build`

亲自执行，原样输出（节选）：

```
> memories@0.1.0 build
> tsc -b && vite build

vite v7.3.6 building client environment for production...
✓ 56 modules transformed.
...
dist/assets/bedroom-1-BgBATr34.png            196.59 kB
dist/assets/bedroom-3-sBac_Vvc.png            239.79 kB
...
✓ built in 333ms
BUILD_EXIT_CODE=0
```

`tsc -b` 未输出任何错误（静默通过即无类型错误），`vite build` 成功产出 dist，14 张裁剪后的物件图均被正常打包进 `dist/assets`（文件名与体积对应 items/ 现状）。**exit 0 确认**。

## 6. 幂等性佐证（间接验证裁剪确已落地、非空跑）

以只读 `--dry` 模式重跑裁剪工具（不写盘）：

```
node scripts/trim-assets.mjs --dry
...（14 行，全部标注"(无需裁剪)"，与当前 items/ 现状尺寸一致）
[dry-run] 处理 14 张，写盘 0 张。
```

说明当前 `items/` 下的 14 张 PNG 已经是裁剪后的最终态（若裁剪未生效或写盘失败，dry-run 会测出还需裁剪的差量）。

## 7. 范围边界核查（S1 vs S2）

- `scripts/check-asset-trim.mjs` 源码通读：脚本内只有 `ITEM_IDS`（14 张物件图 id）参与校验循环；第 110-112 行是纯注释占位（"S2 挂载点"），**没有**对横版书房图做存在性/朝向的实际校验代码。符合 goal「S1 的脚本只需覆盖 14 张物件图这部分并 exit 0」的范围边界，未越界也未遗漏。
- `backgrounds/` 目录三张场景图 mtime 均为 `Jul 15 23:31`，早于 `items/*.png` 的裁剪时间 `Jul 16 22:28`，确认背景图本轮未被触碰（原本就不该动）。
- `src/assets/manifest.ts` 里 `BACKGROUNDS` 数组仍是原 3 条（reading-nook/living-room/bedroom），未新增横版书房条目——符合「新增横版书房场景图由 S2 负责」的边界，S1 不应该也没有提前做这部分。
- N1-S1.json 的 goal 全文未提及 schema v2，回执亦声明未做，核对 milestones.json N1 里 schema v2 那条 criteria（`e2e/n1-foundation.spec.ts`）确认是完整 N1 里程碑的要求、非 N1-S1 这个子 sprint 的范围，S1 本轮不判该项。

## 8. .opc/ 边界巡查（非本次判定项，仅记录观察）

`find .opc -type f -newer items/bedroom-1.png` 只命中 `.opc/lock.json` 与 `.opc/ledger/sessions.jsonl` —— 均为 OPC 框架运行时自动维护的锁/会话账本，非建造交付物涉及的业务文件（milestones.json / N1-S1.json / receipt 等均未被改动）。未见建造员绕过 `opc.mjs` 直接写 `.opc/` 业务档案的痕迹。

---

## 结论

对照 N1-S1.json goal 与 milestones.json N1 中属于 S1 范围的硬指标，逐条亲手核查：

1. 14 张物件 PNG 四边透明边 ≤8px（实测最大 6px）—— 达标，双工具独立复核一致。
2. `node scripts/check-asset-trim.mjs` exit 0，脚本判定逻辑忠实对应 goal 的 alpha 阈值/呼吸边/宽高比三重校验，未偷工减料，正确划清 S2 边界（未越界检查横版书房图）—— 达标。
3. `src/assets/manifest.ts` 14 条 aspectRatio 与裁剪后图片真实实体宽高比逐条一致（独立复算比对，非信任自报）—— 达标。
4. `npm run build` exit 0，无类型错误，14 张裁剪图正确打包 —— 达标。
5. idea.json 点名的两个问题（大片透明边、阴影撑歪比例/复古闹钟应为竖向）—— 目视 + 数值双重确认已解决。

未发现缺项、错项或不达标项，未发现范围越界或遗漏。裁决：放行。
