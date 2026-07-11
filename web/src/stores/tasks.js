import { defineStore } from 'pinia'
import { apiGenerateStatus, apiBatchStatus, apiWorkflowRunStatus } from '@/api'

// 全局任务中心：生成/连拍/工作流运行注册到这里后，由 store 自己轮询直到终态——
// 用户切到别的页面，任务照样在跑、顶栏照样能看到进度，不再"离开工作台进度就丢了"。
// 页面内部原有的轮询（用于页内实时 UI）保持不动，这里是跨页面的兜底视图。

const POLL_MS = 3000
const MAX_KEEP = 12 // 只留最近的一批，避免无限增长

export const useTasksStore = defineStore('tasks', {
  state: () => ({
    tasks: [] // { key, kind: generate|batch|workflow, label, link, status: running|success|failed|canceled, createdAt, finishedAt }
  }),
  getters: {
    activeCount: s => s.tasks.filter(t => t.status === 'running').length,
    recent: s => [...s.tasks].sort((a, b) => b.createdAt - a.createdAt)
  },
  actions: {
    _upsert(task) {
      const i = this.tasks.findIndex(t => t.key === task.key)
      if (i >= 0) Object.assign(this.tasks[i], task)
      else {
        this.tasks.unshift(task)
        if (this.tasks.length > MAX_KEEP) {
          // 优先淘汰已完成的旧任务，绝不丢正在运行的
          const idx = this.tasks.map((t, j) => [t, j]).reverse().find(([t]) => t.status !== 'running')
          if (idx) this.tasks.splice(idx[1], 1)
        }
      }
    },
    _finish(key, status) {
      const t = this.tasks.find(x => x.key === key)
      if (t) { t.status = status; t.finishedAt = Date.now() }
    },
    // kind: 'generate' | 'batch' | 'workflow'；id 为对应的轮询主键；label 展示名；link 点击跳转
    track(kind, id, label, link) {
      const key = `${kind}:${id}`
      if (this.tasks.some(t => t.key === key)) return
      this._upsert({ key, kind, label, link: link || '', status: 'running', createdAt: Date.now(), finishedAt: null })

      const poll = async () => {
        try {
          if (kind === 'generate') {
            const g = await apiGenerateStatus(id)
            if (g.status === 'success' || g.status === 'failed') return this._finish(key, g.status)
          } else if (kind === 'batch') {
            const d = await apiBatchStatus(id)
            if (d.done) {
              const okCount = (d.list || []).filter(i => i.status === 'success').length
              return this._finish(key, okCount ? 'success' : 'failed')
            }
          } else if (kind === 'workflow') {
            const { run } = await apiWorkflowRunStatus(id)
            if (['success', 'failed', 'canceled'].includes(run?.status)) return this._finish(key, run.status)
          }
        } catch (e) {
          // 单次轮询失败不终止任务（网络抖动），交给下一轮
        }
        const t = this.tasks.find(x => x.key === key)
        if (t && t.status === 'running') setTimeout(poll, POLL_MS)
      }
      setTimeout(poll, POLL_MS)
    }
  }
})
