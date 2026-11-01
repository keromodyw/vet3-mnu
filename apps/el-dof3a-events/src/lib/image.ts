/** shrinks a phone screenshot/photo to a ≤1600px JPEG so the upload is fast and always under the 5 MB limit */
export async function compressImage(file: File, maxSide = 1600, quality = 0.82): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img: HTMLImageElement = await new Promise((res, rej) => {
      const i = new Image()
      i.onload = () => res(i); i.onerror = () => rej(new Error('bad image')); i.src = url
    })
    const k = Math.min(1, maxSide / Math.max(img.width, img.height))
    const c = document.createElement('canvas')
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    const blob: Blob | null = await new Promise((r) => c.toBlob(r, 'image/jpeg', quality))
    if (!blob) throw new Error('compress failed')
    return blob
  } finally {
    URL.revokeObjectURL(url)
  }
}
