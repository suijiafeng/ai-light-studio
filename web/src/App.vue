<template>
  <div class="app-shell">
    <header class="app-header">
      <div class="header-inner">
        <router-link to="/" class="logo">
          <el-icon :size="22" class="logo-icon"><Sunny /></el-icon>
          <span class="mk-gradient-text">代码工匠 · AI灯光设计</span>
        </router-link>

        <nav class="nav">
          <router-link to="/studio">工作台</router-link>
          <router-link to="/workflows">工作流</router-link>
          <router-link to="/history">历史图库</router-link>
          <router-link to="/batch">批量处理</router-link>
          <router-link to="/recharge">充值中心</router-link>
          <router-link v-if="userStore.isAdmin" to="/admin">数据统计</router-link>
        </nav>

        <div class="header-right">
          <el-tooltip :content="themeStore.dark ? '切换亮色模式' : '切换暗黑模式'">
            <el-button circle text @click="themeStore.toggle()">
              <el-icon :size="18"><Moon v-if="!themeStore.dark" /><Sunny v-else /></el-icon>
            </el-button>
          </el-tooltip>

          <template v-if="userStore.isLogin && userStore.user">
            <el-tag effect="plain" class="credits-tag" @click="$router.push('/recharge')">
              <el-icon><Coin /></el-icon>&nbsp;{{ userStore.credits }} 算力
            </el-tag>
            <el-dropdown @command="onCommand">
              <span class="user-chip">
                <el-avatar :size="30" class="avatar">{{ userStore.user.nickname?.[0]?.toUpperCase() }}</el-avatar>
                <span class="nickname">{{ userStore.user.nickname }}</span>
                <el-tag v-if="userStore.isMember" size="small" type="warning" effect="dark">会员</el-tag>
              </span>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="profile"><el-icon><User /></el-icon>个人中心</el-dropdown-item>
                  <el-dropdown-item command="orders"><el-icon><Tickets /></el-icon>订单与明细</el-dropdown-item>
                  <el-dropdown-item divided command="logout"><el-icon><SwitchButton /></el-icon>退出登录</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
          <el-button v-else class="mk-btn-gradient" @click="$router.push('/login')">登录 / 注册</el-button>
        </div>
      </div>
    </header>

    <main class="app-main">
      <router-view />
    </main>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { useThemeStore } from '@/stores/theme'

const router = useRouter()
const userStore = useUserStore()
const themeStore = useThemeStore()

onMounted(() => {
  themeStore.apply()
  userStore.fetchMe()
})

const onCommand = cmd => {
  if (cmd === 'logout') {
    userStore.logout()
    router.push('/')
  } else {
    router.push(`/${cmd}`)
  }
}
</script>

<style scoped lang="scss">
.app-shell { min-height: 100%; display: flex; flex-direction: column; }

.app-header {
  position: sticky;
  top: 0;
  z-index: 100;
  background: var(--mk-card);
  border-bottom: 1px solid var(--mk-border);
}
.header-inner {
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 20px;
  height: 60px;
  display: flex;
  align-items: center;
  gap: 28px;
}

/* 移动端：logo缩短、导航横向滚动、隐藏昵称 */
@media (max-width: 768px) {
  .header-inner { gap: 10px; padding: 0 10px; }
  .logo span { display: none; }
  .nav {
    overflow-x: auto; flex-wrap: nowrap; -webkit-overflow-scrolling: touch;
    &::-webkit-scrollbar { display: none; }
    a { padding: 6px 10px; font-size: 13px; white-space: nowrap; }
  }
  .user-chip .nickname { display: none; }
  .credits-tag { font-size: 11px; }
}
.logo {
  display: flex; align-items: center; gap: 8px;
  font-size: 17px; font-weight: 800; text-decoration: none;
  .logo-icon { color: var(--mk-primary); }
}
.nav {
  display: flex; gap: 4px; flex: 1; align-items: center; align-self: stretch;
  a {
    display: flex; align-items: center; height: 100%;
    padding: 0 14px; text-decoration: none; box-sizing: border-box;
    color: var(--mk-text-2); font-size: 14px; font-weight: 500;
    border-bottom: 2px solid transparent; transition: color 0.15s, border-color 0.15s;
    &:hover { color: var(--mk-text); }
    &.router-link-active { color: var(--mk-primary); border-color: var(--mk-primary); font-weight: 600; }
  }
}
.header-right { display: flex; align-items: center; gap: 12px; }
.credits-tag { cursor: pointer; }
.user-chip {
  display: flex; align-items: center; gap: 8px; cursor: pointer; outline: none;
  .avatar { background: var(--mk-gradient); font-weight: 700; }
  .nickname { font-size: 14px; color: var(--mk-text); max-width: 90px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
}
.app-main { flex: 1; }
</style>
