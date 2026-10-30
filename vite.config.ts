import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'
import { cpSync, existsSync } from 'node:fs'

// The app lives at https://<project>.pages.dev/yalla-nezaker/
// Anything inside /site-root is copied to the root of the deployed site
// (that's where the "other thing" for the root URL goes, plus the _redirects file).
function copySiteRoot(): Plugin {
  return {
    name: 'copy-site-root',
    apply: 'build',
    closeBundle() {
      if (existsSync('site-root')) cpSync('site-root', 'dist', { recursive: true })
    },
  }
}

export default defineConfig({
  base: '/yalla-nezaker/',
  plugins: [react(), tailwindcss(), copySiteRoot()],
  build: {
    outDir: 'dist/yalla-nezaker',
    emptyOutDir: true,
  },
})
