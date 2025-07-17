import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  { path: '/', name: 'home', component: () => import('@/views/HomeView.vue'), meta: { title: '首页' } },
  { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { title: '登录' } },
  { path: '/studio', name: 'studio', component: () => import('@/views/StudioView.vue'), meta: { title: 'AI灯光工作台', auth: true } },
  { path: '/history', name: 'history', component: () => import('@/views/HistoryView.vue'), meta: { title: '历史图库', auth: true } },
  { path: '/recharge', name: 'recharge', component: () => import('@/views/RechargeView.vue'), meta: { title: '充值中心', auth: true } },
  { path: '/orders', name: 'orders', component: () => import('@/views/OrdersView.vue'), meta: { title: '订单与明细', auth: true } },
  { path: '/profile', name: 'profile', component: () => import('@/views/ProfileView.vue'), meta: { title: '个人中心', auth: true } },
  { path: '/admin', name: 'admin', component: () => import('@/views/AdminView.vue'), meta: { title: '管理后台', auth: true, admin: true } },
  { path: '/batch', name: 'batch', component: () => import('@/views/BatchView.vue'), meta: { title: '批量处理', auth: true } },
  { path: '/report/:id', name: 'report', component: () => import('@/views/ReportView.vue'), meta: { title: '灯光方案报告', auth: true } },
  { path: '/s/:shareId', name: 'share', component: () => import('@/views/SharePage.vue'), meta: { title: '作品分享' } },
  { path: '/legal', name: 'legal', component: () => import('@/views/LegalView.vue'), meta: { title: '协议与隐私' } },
  { path: '/:pathMatch(.*)*', redirect: '/' }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach(to => {
  document.title = `${to.meta.title || ''} · 代码工匠AI灯光设计`
  if (to.meta.auth && !localStorage.getItem('token')) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
})

export default router
