
export function compressImage(file, maxSize = 2048, maxBytes = 2 * 1024 * 1024) {
  return new Promise(resolve => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return resolve(file)
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
      if (scale >= 1 && file.size <= maxBytes) return resolve(file) // 尺寸和体积都达标
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(
        blob => resolve(blob ? new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }) : file),
        'image/jpeg', 0.9
      )
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file) }
    img.src = url
  })
}

export function requestNotifyPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {})
  }
}

let flashTimer = null
// text：通知正文；onClick：点击系统通知后要做的事（一般是跳转到结果页）——
// 是否该弹这条通知由调用方判断（比如"用户是不是已经不在这个任务所在的页面了"），这里只负责怎么弹。
export function notifyDone(text = 'AI灯光效果已生成完成！', onClick) {
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      const n = new Notification('代码工匠AI灯光设计', { body: text })
      n.onclick = () => { window.focus(); n.close(); onClick && onClick() }
    } catch (e) {  }
  }
  if (!document.hidden) return // 标签页本来就在前台，没必要闪标题
  const original = document.title
  clearInterval(flashTimer)
  flashTimer = setInterval(() => {
    document.title = document.title.startsWith('【') ? original : `【生成完成】${original}`
  }, 1000)
  const restore = () => {
    if (!document.hidden) {
      clearInterval(flashTimer)
      document.title = original
      document.removeEventListener('visibilitychange', restore)
    }
  }
  document.addEventListener('visibilitychange', restore)
}
