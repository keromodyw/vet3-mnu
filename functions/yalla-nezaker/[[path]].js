export async function onRequest(context) {
  const url = new URL(context.request.url)
  const last = url.pathname.split('/').pop() || ''
  // real files (js, css, images) are served normally
  if (last.includes('.')) return context.next()
  // any app route -> the app's index.html
  return context.env.ASSETS.fetch(new URL('/yalla-nezaker/', url.origin))
}
