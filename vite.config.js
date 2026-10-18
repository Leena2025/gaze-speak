import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

import { createNewsHandler } from './server/news.js'

const faceDetectionCommonJsEntry = fileURLToPath(
  new URL('./node_modules/@tensorflow-models/face-detection/dist/index.js', import.meta.url),
)

// Serves /api/news from the dev server and `vite preview`, so news works with
// `npm run dev` exactly as with the production server (server/index.js).
function newsApi() {
  let handler = null
  const mount = (server) => {
    server.middlewares.use('/api/news', (req, res) => {
      handler ??= createNewsHandler()
      req.url = `/api/news${req.url === '/' ? '' : req.url}`
      handler(req, res)
    })
  }
  return { name: 'igaze-news-api', configureServer: mount, configurePreviewServer: mount }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), newsApi()],
  // The face-tracking chunk (TF.js + FaceMesh, ~900 kB) is loaded on demand.
  build: { chunkSizeWarningLimit: 1000 },
  resolve: {
    alias: [
      {
        find: /^@tensorflow-models\/face-detection$/,
        replacement: faceDetectionCommonJsEntry,
      },
    ],
  },
})
