// 极简 PNG 编解码（纯 Node 内置 zlib，零外部依赖）。
//
// 仅支持本项目 items/ 下 14 张物件图实际使用的格式：
//   位深 8、颜色类型 6（RGBA）、非交错（interlace=0）。
// 解码时若遇到其它格式会显式抛错，避免静默给出错误像素。
//
// 之所以自己写而不装 sharp/pngjs：裁剪脚本与校验脚本都要跑，
// 手写方案让二者对同一份文件用同一套解码逻辑、且不依赖 node_modules
// 里额外的库，评审环境无论是否 npm install 都能 `node` 直接跑通。

import zlib from 'node:zlib';

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// —— CRC32（PNG chunk 校验，编码时需要）——
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/**
 * 解码 8-bit RGBA 非交错 PNG。
 * @param {Buffer} buf
 * @returns {{ width:number, height:number, data:Uint8Array }} data 为 width*height*4 的 RGBA
 */
export function decodePNG(buf) {
  if (!buf.subarray(0, 8).equals(PNG_SIG)) throw new Error('不是合法 PNG（签名不符）');

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat = [];

  let off = 8;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const dataStart = off + 8;
    const data = buf.subarray(dataStart, dataStart + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') {
      idat.push(Buffer.from(data));
    } else if (type === 'IEND') {
      break;
    }
    off = dataStart + len + 4; // 跳过 4 字节 CRC
  }

  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
    throw new Error(`不支持的 PNG 格式（bitDepth=${bitDepth} colorType=${colorType} interlace=${interlace}），本工具仅支持 8-bit RGBA 非交错`);
  }

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const channels = 4;
  const stride = width * channels;
  const out = new Uint8Array(width * height * channels);
  let prev = new Uint8Array(stride); // 上一扫描线（已重建）
  let pos = 0;

  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const cur = out.subarray(y * stride, y * stride + stride);
    raw.copy ? raw.copy(cur, 0, pos, pos + stride) : cur.set(raw.subarray(pos, pos + stride));
    pos += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0; // 左
      const b = prev[x]; // 上
      const c = x >= channels ? prev[x - channels] : 0; // 左上
      let v = cur[x];
      switch (filter) {
        case 0: break;
        case 1: v = (v + a) & 0xff; break;
        case 2: v = (v + b) & 0xff; break;
        case 3: v = (v + ((a + b) >> 1)) & 0xff; break;
        case 4: v = (v + paeth(a, b, c)) & 0xff; break;
        default: throw new Error(`未知扫描线过滤类型 ${filter}`);
      }
      cur[x] = v;
    }
    prev = cur;
  }

  return { width, height, data: out };
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/**
 * 编码 8-bit RGBA 非交错 PNG。
 * 逐行自适应选 filter（libpng 经典 minsum 启发式：取「有符号字节绝对值之和」
 * 最小的那种过滤），压缩率明显优于恒用 filter=0，避免裁剪后体积反增。
 * @param {{ width:number, height:number, data:Uint8Array }} img
 * @returns {Buffer}
 */
export function encodePNG({ width, height, data }) {
  const channels = 4;
  const stride = width * channels;
  const rawWithFilter = Buffer.alloc((stride + 1) * height);
  const prevRow = new Uint8Array(stride); // 上一行原始（未过滤）字节
  const cand = [new Uint8Array(stride), new Uint8Array(stride), new Uint8Array(stride), new Uint8Array(stride), new Uint8Array(stride)];

  for (let y = 0; y < height; y++) {
    const rowStart = y * stride;
    const cur = data.subarray(rowStart, rowStart + stride);
    let best = 0;
    let bestScore = Infinity;
    for (let ft = 0; ft < 5; ft++) {
      const out = cand[ft];
      let score = 0;
      for (let x = 0; x < stride; x++) {
        const a = x >= channels ? cur[x - channels] : 0;
        const b = prevRow[x];
        const c = x >= channels ? prevRow[x - channels] : 0;
        let v;
        switch (ft) {
          case 0: v = cur[x]; break;
          case 1: v = (cur[x] - a) & 0xff; break;
          case 2: v = (cur[x] - b) & 0xff; break;
          case 3: v = (cur[x] - ((a + b) >> 1)) & 0xff; break;
          default: v = (cur[x] - paeth(a, b, c)) & 0xff; break;
        }
        out[x] = v;
        score += v < 128 ? v : 256 - v; // |signed byte|
      }
      if (score < bestScore) { bestScore = score; best = ft; }
    }
    const dst = y * (stride + 1);
    rawWithFilter[dst] = best;
    Buffer.from(cand[best].buffer, cand[best].byteOffset, stride).copy(rawWithFilter, dst + 1);
    prevRow.set(cur);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const idat = zlib.deflateSync(rawWithFilter, { level: 9 });
  return Buffer.concat([
    PNG_SIG,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idat),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * 从 RGBA 图裁出子矩形（含边界，left/top 起，宽 w 高 h）。
 */
export function cropRGBA(img, left, top, w, h) {
  const channels = 4;
  const out = new Uint8Array(w * h * channels);
  for (let y = 0; y < h; y++) {
    const srcStart = ((top + y) * img.width + left) * channels;
    const dstStart = y * w * channels;
    out.set(img.data.subarray(srcStart, srcStart + w * channels), dstStart);
  }
  return { width: w, height: h, data: out };
}
