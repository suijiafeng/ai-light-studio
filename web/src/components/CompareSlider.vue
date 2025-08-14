<template>
  <div ref="wrap" class="compare" @pointerdown="onDown" @pointermove="onMove" @pointerup="dragging = false" @pointerleave="dragging = false">
        <img :src="after" class="spacer" aria-hidden="true" alt="" />
    <img :src="after" class="img" draggable="false" alt="效果图" />
    <img :src="before" class="img before-img" :style="{ clipPath: `inset(0 ${100 - pos}% 0 0)` }" draggable="false" alt="原图" />
    <div class="handle" :style="{ left: pos + '%' }">
      <div class="handle-line"></div>
      <div class="handle-btn">⇔</div>
    </div>
    <span class="tag tag-l">原图</span>
    <span class="tag tag-r">效果图</span>
  </div>
</template>

<script setup>
import { ref } from 'vue'

defineProps({ before: String, after: String })

const wrap = ref()
const pos = ref(50)
const dragging = ref(false)

const setPos = e => {
  const rect = wrap.value.getBoundingClientRect()
  pos.value = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100))
}
const onDown = e => { dragging.value = true; setPos(e) }
const onMove = e => { if (dragging.value) setPos(e) }
</script>

<style scoped lang="scss">
.compare {
  position: relative; overflow: hidden; border-radius: 10px;
  cursor: ew-resize; user-select: none; touch-action: none;
  background: rgba(0, 0, 0, 0.15);
    .spacer { display: block; width: 100%; height: auto; visibility: hidden; pointer-events: none; }
    .img {
    position: absolute; inset: 0; width: 100%; height: 100%;
    object-fit: contain; display: block;
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
