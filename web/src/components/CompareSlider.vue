<template>
  <div ref="wrap" class="compare" @pointerdown="onDown" @pointermove="onMove" @pointerup="dragging = false" @pointerleave="dragging = false">
    <img :src="after" class="img" draggable="false" alt="效果图" />
    <div class="before-clip" :style="{ width: pos + '%' }">
      <img :src="before" class="img before-img" :style="{ width: wrapWidth + 'px' }" draggable="false" alt="原图" />
    </div>
    <div class="handle" :style="{ left: pos + '%' }">
      <div class="handle-line"></div>
      <div class="handle-btn">⇔</div>
    </div>
    <span class="tag tag-l">原图</span>
    <span class="tag tag-r">效果图</span>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'

defineProps({ before: String, after: String })

const wrap = ref()
const pos = ref(50)
const dragging = ref(false)
const wrapWidth = ref(0)

const updateWidth = () => { wrapWidth.value = wrap.value?.clientWidth || 0 }
onMounted(() => { updateWidth(); window.addEventListener('resize', updateWidth) })
onBeforeUnmount(() => window.removeEventListener('resize', updateWidth))

const setPos = e => {
  const rect = wrap.value.getBoundingClientRect()
  pos.value = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100))
}
const onDown = e => { dragging.value = true; updateWidth(); setPos(e) }
const onMove = e => { if (dragging.value) setPos(e) }
</script>

<style scoped lang="scss">
.compare {
  position: relative; overflow: hidden; border-radius: 10px;
  cursor: ew-resize; user-select: none; touch-action: none;
  background: rgba(0, 0, 0, 0.15);
  .img { width: 100%; display: block; }
  .before-clip {
    position: absolute; inset: 0 auto 0 0; overflow: hidden;
    .before-img { max-width: none; height: 100%; object-fit: cover; }
  }
  .handle {
    position: absolute; top: 0; bottom: 0; transform: translateX(-50%); pointer-events: none;
    .handle-line { position: absolute; top: 0; bottom: 0; left: 50%; width: 2px; background: #fff; box-shadow: 0 0 6px rgba(0,0,0,0.5); }
    .handle-btn {
      position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
      width: 34px; height: 34px; border-radius: 50%; background: var(--mk-gradient);
      color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700;
      box-shadow: 0 2px 10px rgba(0,0,0,0.35);
    }
  }
  .tag {
    position: absolute; top: 10px; font-size: 12px; color: #fff;
    background: rgba(0, 0, 0, 0.5); padding: 2px 10px; border-radius: 20px;
    &.tag-l { left: 10px; } &.tag-r { right: 10px; }
  }
}
</style>
