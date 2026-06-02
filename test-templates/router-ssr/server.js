import fs from 'node:fs/promises'
import express from 'express'

const isProduction = process.env.NODE_ENV === 'production'
const port = process.env.PORT || 3000
const templateHtml = isProduction ? await fs.readFile('./dist/client/index.html', 'utf-8') : ''
const app = express()

let vite
if (!isProduction) {
  const { createServer } = await import('vite')
  vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  app.use(vite.middlewares)
} else {
  // 生产模式：gzip 压缩 + 静态文件服务
  const compression = (await import('compression')).default  // gzip/brotli 压缩
  const sirv = (await import('sirv')).default                // 轻量静态文件服务
  app.use(compression())                                      // 所有响应自动压缩
  app.use(sirv('./dist/client', { extensions: [] }))         // serve vite 客户端构建产物
}

// SSR 页面渲染：跳过带扩展名的静态资源请求（ico/js/css/svg 等）
app.use(async (req, res) => {
  try {
    const url = req.originalUrl
    if (/\.[a-z0-9]+$/i.test(req.path) && !req.path.endsWith('.html')) return
    let template, render
    if (!isProduction) {
      template = await fs.readFile('./index.html', 'utf-8')
      template = await vite.transformIndexHtml(url, template)
      render = (await vite.ssrLoadModule('/src/entry-server.ts')).render
    } else {
      template = templateHtml
      render = (await import('./dist/server/entry-server.js')).render
    }
    const { html } = await render(url)
    res.status(200).set({ 'Content-Type': 'text/html' }).send(template.replace('<!--app-html-->', html))
  } catch (e) {
    vite?.ssrFixStacktrace(e)
    console.error(e)
    res.status(500).end(e.stack)
  }
})

app.listen(port, () => console.log(`SSR: http://localhost:${port}`))
