# N1-S3 评审证据（reviewer）

sprint：N1-S3 · milestone N1（素材与数据地基 · 回炉第一块）
评判尺子：仅对照 `.opc/sprints/N1-S3.json` 原文（书房图调色分级达标 + 三项命令不受影响 + 不越界改动），不拿 N1 全册其他条目或个人口味为难建造员。
裁决：**pass，准予放行定稿**。

---

## 1. 亲眼查看新图 vs 客厅/卧室参照图

方法：直接 Read 图片文件查看（原图 + 缩放缩略图 + 局部高倍裁剪），不看建造员自报描述。

- 三图缩略对比（`collage-3.jpg`：客厅｜卧室｜书房新图）：书房新图整体色调转为暖调、书架彩色书脊与坐垫的鲜艳数码直出感明显褪去，墙面/木色/织物呈现统一的暖旧色调，与卧室的暖琥珀暗调、客厅的低饱和空气感可视为同一气质族群（此前检察员判"孤例式偏高"的观感已不复见）。
- 局部高倍裁剪核对胶片颗粒（芥末黄抱枕区 `reading-nook-pillow-crop.jpg` 与窗台平滑区 2x 放大 `rn-sill-crop-2x.jpg`）：肉眼可见均匀细颗粒噪点，平滑面（窗台白瓷、盆器、抱枕布面）颗粒感明确，非此前"鲜艳数码直出感"的干净数码质感。
- 用建造员会话遗留在同一 scratchpad 的原图备份（`reading-nook-wide-ORIGINAL.jpg`，md5 与现产物不同，确认非同一文件）做同区域裁剪对照（`reading-nook-ORIG-pillow-crop.jpg` / `reading-nook-ORIG-corner-tl.jpg`）：原图芥末黄抱枕饱和度明显更艳、书脊颜色更鲜亮，与新图并排对比可见明显褪色/降饱和/暖移变化，证明改动真实发生、非空转。
- 暗角/褪色：新图边角相对中心略有压暗与去饱和迹象（`reading-nook-corner-tl.jpg` vs 中心裁剪），高光窗户区未见原图那种数码直出式过曝惨白，符合"暗角褪色质感"描述。

结论：三张场景图色调气质现可视为一组，符合 design.md「暖奶油底、低饱和旧纸色、不用纯白」基调与本 sprint 验收硬指标描述。**此条判过。**

---

## 2. 亲手用 Python PIL 独立复核三图 HSV 平均饱和度

命令（未看建造员数字前独立编写并执行，口径与上一轮检察员一致：resize 600×400 → 转 HSV → S 通道均值 / 255 × 100%）：

```python
from PIL import Image
files = {
    "living-room": "backgrounds/living-room-demo.jpg",
    "bedroom": "backgrounds/bedroom-demo.jpg",
    "reading-nook-wide (new)": "backgrounds/reading-nook-wide-demo.jpg",
}
for name, path in files.items():
    im = Image.open(path).convert("RGB").resize((600,400))
    h,s,v = im.convert("HSV").split()
    sdata = list(s.getdata())
    print(name, sum(sdata)/len(sdata)/255*100)
```

实测输出（本机独立跑出，未抄建造员 receipt）：
```
living-room  backgrounds/living-room-demo.jpg   (3000, 2000)  -> 14.96%
bedroom      backgrounds/bedroom-demo.jpg        (3000, 1684)  -> 36.97%
reading-nook-wide (new) backgrounds/reading-nook-wide-demo.jpg (3000, 2000) -> 35.35%
```

又额外用同一份 scratchpad 里建造员留存的调色前原图 `reading-nook-wide-ORIGINAL.jpg` 独立复测：
```
ORIGINAL mean S% = 50.13%
```
（md5 校验：ORIGINAL 与现 backgrounds/reading-nook-wide-demo.jpg 内容不同，确认调色确实发生、不是同一份文件。）

对照上一轮独立检察员判词「书房图饱和度约49.8%，显著高于客厅14.7%与卧室37%」：
- 独立复测的调色前原图饱和度 50.13%，与检察员的 49.8% 基本吻合（同口径复现）；
- 调色后新图饱和度 35.35%，落在客厅 14.96% 与卧室 36.97% 之间、贴近卧室下侧，不再是显著偏高的孤例；
- 与建造员自报的「50.1%→35.4%」几乎一致（35.35% vs 35.4%，误差在小数点舍入范围内），自报数字可信、未造假。

结论：饱和度确已压入客厅/卧室同一量级区间，不再是孤例式偏高。**此条判过。**

---

## 3. `npm run build` 独立执行

```
$ npm run build > /tmp/build_out.log 2>&1; echo "REAL_EXIT=$?"
REAL_EXIT=0
```
输出尾部：
```
✓ 56 modules transformed.
...
dist/assets/living-room-demo-qbHPvBCH.jpg        1,401.06 kB
dist/assets/bedroom-demo-He3QiQOW.jpg            1,405.03 kB
dist/assets/reading-nook-wide-demo-BGS9j25s.jpg  1,532.47 kB
dist/assets/index-CAa-fuYT.css                      14.24 kB
dist/assets/index-DIanTPHB.js                      214.74 kB
✓ built in 322ms
```
`tsc -b && vite build` 全绿，无类型错误，exit 0。**此条判过。**

---

## 4. `node scripts/check-asset-trim.mjs` 独立执行

```
$ node scripts/check-asset-trim.mjs > /tmp/trim_out.log 2>&1; echo "REAL_EXIT=$?"
REAL_EXIT=0
```
输出：14 张物件 PNG 全部 `✓`（四边透明边 ≤8px、清单宽高比与实体一致）；
```
横版书房场景图校验（存在性 + 横向朝向）
reading-nook-wide-demo.jpg   3000x2000   ✓ 横向
```
**此条判过。**

---

## 5. `npx playwright test --reporter=line`（全量）独立执行

```
$ npx playwright test --reporter=line > /tmp/pw_out.log 2>&1; echo "REAL_EXIT=$?"
REAL_EXIT=0
Running 14 tests using 1 worker
...
  14 passed (14.5s)
```
用例清单：m1-shell×3、m2-transform×2、m3-story×3、m4-full×3（PC/768px/375px 三视口）、n1-foundation×3 —— 共 14 条全 passed，与建造员自报的「14 passed」一致，未因本次调图受损。**此条判过。**

---

## 6. 改动范围核查

- **items/ 14 张物件 PNG 未被动过**：`ls -la` 显示 14 张全部 mtime = 2026-07-16 22:28:55（早于本 sprint 书房图改动时间 23:39:05），确认本 sprint 会话窗口内未触碰；`check-asset-trim.mjs` 逐张校验也全部 ✓，与上一轮数值一致。
- **N2/N3/N4 范围代码未被误动**：核对 `src/` 下各组件（`Canvas.tsx`/`Workbench.tsx`/`gallery.ts`/`persistence.ts`/`Header.tsx`/`ItemTray.tsx`/`SceneBar.tsx`/`StoryModal.tsx`/`manifest.ts`）mtime，全部落在 22:55–22:59 之间或更早，均早于本 sprint 图片改动时间戳（23:39:05）与本 sprint 回执时间戳（23:41:12），说明这些源码改动属于更早的 sprint（N1-S2 等），本 sprint 会话窗口内未再触碰任何源码文件——没有顺手动 N2/N3/N4 自适应渲染或交互逻辑。（且 N2 的 `e2e/n2-shell.spec.ts` 等文件当前项目里尚不存在，无从改起。）
- **分辨率与朝向**：`backgrounds/reading-nook-wide-demo.jpg` 现为 3000×2000、横向，与调色前原图（scratchpad 留存的 `reading-nook-wide-ORIGINAL.jpg`）尺寸一致，`check-asset-trim.mjs` 独立佐证。
- **dist/ 产物同步**：`dist/assets/reading-nook-wide-demo-BGS9j25s.jpg` mtime 23:39:35，随 `npm run build` 重新哈希打包，与其余两张背景（`bedroom-demo-He3QiQOW.jpg` / `living-room-demo-qbHPvBCH.jpg`）体量同级（1.4~1.5MB）。

**此条判过。**

---

## 7. 是否改了 src/assets/manifest.ts 或其他源码——越界判断

`src/assets/manifest.ts` mtime = 2026-07-16 22:55:54，早于本 sprint 图片改动（23:39:05），文件内注释明确写着「N1-S2：书房换用横版场景图...」——这是上一个 sprint（N1-S2）遗留的改动，非本 sprint 所为。本 sprint（N1-S3）会话窗口内没有任何源码文件的 mtime 落在图片改动前后区间，确认建造员本轮只动了图片本身，未碰 manifest.ts 或其他源码，不存在越界改动。**无需打回。**

---

## 综合裁决

七条逐一亲手核查，条条有证据、条条过：
1. 亲眼看图对比——过（暖调+胶片颗粒+暗角褪色可见，三图成组）
2. 独立 PIL 复测饱和度——过（35.35% 落入 14.96%–36.97% 区间，原图 50.13% 与检察员 49.8% 吻合，确认真实改动）
3. `npm run build`——过（exit 0）
4. `check-asset-trim.mjs`——过（exit 0，14 张 ✓）
5. `playwright test` 全量——过（exit 0，14 passed）
6. 改动范围——过（items/ 与 N2/N3/N4 未动，分辨率朝向不变）
7. 越界判断——过（本 sprint 未改任何源码）

**判定：pass，准予放行定稿。**
