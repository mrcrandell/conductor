<script setup lang="ts">
import { onMounted } from 'vue'
import MediaOrchestrator from '@/components/MediaOrchestrator.vue'
import { useHAConnection } from '@/services/haService'

onMounted(async () => {
  try {
    const connection = await useHAConnection()
    const entityRegistryList = await connection.sendMessagePromise({
      type: 'config/label_registry/list',
    })

    console.log('config/label_registry/list:', entityRegistryList)
  } catch (error) {
    console.error('Failed to fetch label registry list:', error)
  }
})
</script>

<template>
  <main class="home-view-page">
    <div class="home-view-container">
      <!-- Header Area -->
      <div class="home-view-header">
        <div>
          <h1 class="home-view-title">Conductor</h1>
          <p class="home-view-subtitle">Whole Home Orchestration</p>
        </div>
      </div>

      <MediaOrchestrator />
    </div>
  </main>
</template>

<style scoped>
.home-view-page {
  min-height: 100vh;
  background-color: rgb(2 6 23);
  padding: 1.5rem;
  color: rgb(241 245 249);
}

.home-view-container {
  margin: 0 auto;
  max-width: 28rem;
}

.home-view-container > * + * {
  margin-top: 1.5rem;
}

.home-view-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.home-view-title {
  font-size: 1.5rem;
  line-height: 2rem;
  font-weight: 700;
  letter-spacing: -0.025em;
}

.home-view-subtitle {
  font-size: 0.75rem;
  line-height: 1rem;
  color: rgb(148 163 184);
}
</style>
