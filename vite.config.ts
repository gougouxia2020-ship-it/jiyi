import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 念念 · 陈列室 —— 纯前端无后端，LocalStorage 持久化。
// 内置素材位于项目根 backgrounds/ 与 items/（均在项目根内），
// 由 src 内以相对路径 import，Vite 生产构建时打包进 dist/assets（带哈希）。
export default defineConfig({
  plugins: [react()],
});
