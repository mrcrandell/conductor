<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed } from 'vue'
import { useHAConnection } from '@/services/haService'
import { subscribeEntities, type HassEntities, type HassEntity } from 'home-assistant-js-websocket'
import MediaPlayerTile from '@/components/MediaPlayerTile.vue'
import UnifiedTvTile from '@/components/UnifiedTvTile.vue' // Our new unified component

const entities = ref<HassEntities | null>(null)
let unsubscribe: (() => void) | null = null

onMounted(async () => {
  try {
    const connection = await useHAConnection()
    unsubscribe = subscribeEntities(connection, (latestEntities) => {
      entities.value = latestEntities
    })
  } catch (error) {
    console.error('Failed to initialize HA connection:', error)
  }
})

onUnmounted(() => {
  if (unsubscribe) unsubscribe()
})

// 1. Separate standard solo players (Office, Turntable, Bedroom)
const standardPlayers = computed(() => {
  if (!entities.value) return []
  const targets = [
    'media_player.office_speakers',
    'media_player.turntable',
    'media_player.sonos_move',
    'media_player.bedroom_clock',
  ]
  return targets.reduce(
    (acc, id) => {
      const entity = entities.value?.[id]
      if (entity) acc.push({ id, data: entity })
      return acc
    },
    [] as Array<{ id: string; data: HassEntity }>,
  )
})

// 2. Unify the Living Room Soundbar & Apple TV
const unifiedLivingRoom = computed(() => {
  if (!entities.value) return null

  const beam = entities.value['media_player.living_room']
  const atv = entities.value['media_player.living_room_tv']

  if (!beam && !atv) return null

  return {
    beam,
    atv,
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

      <!-- Media Grid -->
      <div class="home-view-zones-section">
        <h2 class="home-view-zones-title">Active Zones</h2>

        <!-- Unified TV / Soundbar Tile -->
        <UnifiedTvTile
          v-if="unifiedLivingRoom"
          :beam="unifiedLivingRoom.beam"
          :atv="unifiedLivingRoom.atv"
        />

        <!-- Solo Media Players -->
        <div v-if="standardPlayers.length > 0" class="home-view-player-grid">
          <MediaPlayerTile
            v-for="player in standardPlayers"
            :key="player.id"
            :entity-id="player.id"
            :entity="player.data"
          />
        </div>
      </div>
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

.home-view-zones-section > * + * {
  margin-top: 1rem;
}

.home-view-zones-title {
  font-size: 1.125rem;
  line-height: 1.75rem;
  font-weight: 600;
  color: rgb(203 213 225);
}

.home-view-player-grid {
  margin-top: 1rem;
  display: grid;
  grid-template-columns: repeat(1, minmax(0, 1fr));
  gap: 1rem;
}
</style>
