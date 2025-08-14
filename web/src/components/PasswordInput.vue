<template>
  <el-input
    :model-value="modelValue"
    :type="show ? 'text' : 'password'"
    :placeholder="placeholder"
    :maxlength="maxlength"
    :prefix-icon="Lock"
    autocomplete="off"
    @update:model-value="v => $emit('update:modelValue', v)"
    @keyup.enter="$emit('enter')"
  >
    <template #suffix>
      <el-icon
        class="pw-eye"
        title="按住查看密码"
        @mousedown.prevent="show = true"
        @mouseup="show = false"
        @mouseleave="show = false"
        @touchstart.prevent="show = true"
        @touchend="show = false"
        @touchcancel="show = false"
      ><View v-if="show" /><Hide v-else /></el-icon>
    </template>
  </el-input>
</template>

<script setup>
import { ref } from 'vue'
import { Lock, View, Hide } from '@element-plus/icons-vue'

defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '请输入密码' },
  maxlength: { type: [String, Number], default: 32 }
})
defineEmits(['update:modelValue', 'enter'])
const show = ref(false)
</script>

<style scoped>
.pw-eye { cursor: pointer; user-select: none; }
.pw-eye:hover { color: var(--mk-primary); }
</style>
