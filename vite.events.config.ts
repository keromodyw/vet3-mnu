import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// El Dof3a Events lives at https://<project>.pages.dev/el-dof3a-events/
// Source: apps/el-dof3a-events  →  built into dist/el-dof3a-events (next to dist/yalla-nezaker)
export default defineConfig({
  root: 'apps/el-dof3a-events',
  base: '/el-dof3a-events/',
  plugins: [react(), tailwindcss()],
  // pre-bundle everything up front: lazily-loaded pages (scanner, reports…) otherwise trigger a mid-session dev reload and crash
  optimizeDeps: { include: ['react', 'react-dom', 'react-router-dom', '@supabase/supabase-js', '@zxing/library', 'jsbarcode', 'xlsx', 'lucide-react'] },
  build: {
    outDir: '../../dist/el-dof3a-events',
    emptyOutDir: true,
  },
})
