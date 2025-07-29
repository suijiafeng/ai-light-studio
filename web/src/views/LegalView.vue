<template>
  <div class="page-container legal">
    <LegalDocs :initial-tab="tab" />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import LegalDocs from '@/components/LegalDocs.vue'

const route = useRoute()
const tab = ref(route.query.tab === 'privacy' ? 'privacy' : 'terms')
</script>

<style scoped>
.legal { max-width: 820px; }
</style>
