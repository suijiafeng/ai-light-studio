/**
 * 前端媒体工具：上传前压缩 + 生成完成通知
 */

/**
 * 图片压缩：超过阈值时用canvas压到maxSize边长、质量0.9
 * @returns {Promise<File>} 压缩后的文件（无需压缩时原样返回）
 */
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

/** 请求通知权限（在用户点击生成时调用） */
export function requestNotifyPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {})
  }
}

let flashTimer = null
/** 生成完成提醒：页面在后台时发浏览器通知 + 标题闪烁 */
export function notifyDone(text = 'AI灯光效果已生成完成！') {
  if (!document.hidden) return
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      const n = new Notification('代码工匠AI灯光设计', { body: text })
      n.onclick = () => { window.focus(); n.close() }
    } catch (e) { /* 部分浏览器限制 */ }
  }
  // 标题闪烁，回到页面自动恢复
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
