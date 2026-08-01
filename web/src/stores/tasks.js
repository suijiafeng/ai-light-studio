import { defineStore } from 'pinia'
import { apiGenerateStatus, apiBatchStatus, apiWorkflowRunStatus, apiCreditLogs } from '@/api'
import { notifyDone } from '@/utils/media'
import router from '@/router'

// 全局任务中心：生成/连拍/工作流运行注册到这里后，由 store 自己轮询直到终态——
// 用户切到别的页面，任务照样在跑、顶栏照样能看到进度，不再"离开工作台进度就丢了"。
// 页面内部原有的轮询（用于页内实时 UI）保持不动，这里是跨页面的兜底视图。
// tasks 数组同步写入 localStorage：硬刷新页面会清空所有内存状态（Pinia 不例外），
// 不持久化的话轮询和"刚生成完"的记忆都会随刷新一起消失，见 resumePending()。

const POLL_MS = 3000
const MAX_KEEP = 12 // 只留最近的一批，避免无限增长
const STORAGE_KEY = 'ai-light-tasks'
// 刷新后重新接上轮询时，运行状态已经超过这个时长的大概率是很久以前异常中断的（比如那次浏览器直接被关掉），
// 不再无限重试——单次生成最长也就 AI_TIMEOUT_MS(180s) 量级，30 分钟是非常宽松的上限
const STALE_RUNNING_MS = 30 * 60 * 1000

const loadPersisted = () => {
  try {
    const tasks = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(tasks) ? tasks : []
  } catch (e) { return [] }
}
const persist = tasks => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)) } catch (e) {  }
}

export const useTasksStore = defineStore('tasks', {
  state: () => ({
    tasks: loadPersisted() // { key, kind: generate|batch|workflow, id, label, link, sourcePath, status: running|success|failed|canceled, createdAt, finishedAt }
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
      persist(this.tasks)
    },
    _finish(key, status) {
      const t = this.tasks.find(x => x.key === key)
      if (!t) return
      t.status = status
      t.finishedAt = Date.now()
      persist(this.tasks)
      // 用户还在任务发起的那个页面、且标签页可见 = 页面自己的实时UI已经在展示结果了，不用再打扰；
      // 否则（切去了别的路由，或者切到别的标签页/最小化了）就是"用户不在这儿"，得主动提醒一下。
      const away = document.hidden || router.currentRoute.value.path !== t.sourcePath
      if (away) {
        const text = status === 'success' ? `${t.label} 已完成` : status === 'failed' ? `${t.label} 生成失败` : `${t.label} 已取消`
        notifyDone(text, () => t.link && router.push(t.link))
      }
    },
    // kind: 'generate' | 'batch' | 'workflow'；id 为对应的轮询主键；label 展示名；
    // link 点击跳转到的精确结果页；sourcePath 任务发起页（省略则等于link，比如工作流画布本身既是发起页也是结果页）
    track(kind, id, label, link, sourcePath) {
      const key = `${kind}:${id}`
      if (this.tasks.some(t => t.key === key)) return
      this._upsert({ key, kind, id, label, link: link || '', sourcePath: sourcePath || link || '', status: 'running', createdAt: Date.now(), finishedAt: null })
      this._poll(kind, id, key)
    },
    _poll(kind, id, key) {
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
    },
    // 页面刷新后 store 重新创建时调用一次：持久化下来的任务里，还标着 running 的那些
    // 早就没有真正的轮询在跑了（旧轮询的 setTimeout 链跟着上一次页面生命周期一起没了），得重新接上
    resumePending() {
      for (const t of this.tasks) {
        if (t.status !== 'running') continue
        if (Date.now() - t.createdAt > STALE_RUNNING_MS) { this._finish(t.key, 'failed'); continue }
        this._poll(t.kind, t.id, t.key)
      }
    },
    // 一次性通知：跟 track() 的任务不同，这类事件创建时就已经是终态，不需要轮询——
    // 复用同一套 _upsert/localStorage/铃铛列表，只是不进入 running 状态、不触发原生通知
    notify(kind, id, label, link) {
      const key = `${kind}:${id}`
      if (this.tasks.some(t => t.key === key)) return
      this._upsert({ key, kind, id, label, link: link || '', sourcePath: '', status: 'success', createdAt: Date.now(), finishedAt: Date.now() })
    },
    // 邀请奖励是"别人做了件事，你才受益"的后台事件，本人不会主动发起、也没有可轮询的进行中状态，
    // 只能靠定期回看算力流水（credit_logs）里有没有新的 type=invite 记录来发现——每次app加载查一次即可，
    // 不需要频繁轮询：这种奖励本来就是小概率、非实时性事件
    async checkRewards() {
      try {
        const lastSeen = Number(localStorage.getItem('ai-light-reward-seen') || 0)
        const { list } = await apiCreditLogs({ page: 1, size: 10 })
        let maxTs = lastSeen
        for (const log of list || []) {
          if (log.type === 'invite' && log.createdAt > lastSeen) {
            this.notify('reward', log.id, log.remark || '获得邀请奖励', '/orders?tab=logs')
          }
          if (log.createdAt > maxTs) maxTs = log.createdAt
        }
        if (maxTs > lastSeen) localStorage.setItem('ai-light-reward-seen', String(maxTs))
      } catch (e) {  }
    }
  }
})
