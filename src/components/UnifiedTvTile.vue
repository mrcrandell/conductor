<script setup lang="ts">
import { computed } from 'vue'
import type { HassEntity } from 'home-assistant-js-websocket'
import { callService } from 'home-assistant-js-websocket'
import { useHAConnection } from '@/services/haService'

const props = defineProps<{
  beam?: HassEntity // Sonos Beam (media_player.living_room)
  atv?: HassEntity // Apple TV (media_player.living_room_tv)
  roomName?: string
}>()

const displayRoomName = computed(() => {
  return props.roomName || 'Room'
})

// State detection
const isTvActive = computed(() => {
  const atvPlaying = props.atv?.state === 'playing'
  const beamPlaying = props.beam?.state === 'playing'
  return atvPlaying || beamPlaying
})

const activeSource = computed(() => {
  if (props.atv?.state === 'playing' || props.atv?.state === 'paused') {
    return 'apple_tv'
  }
  if (props.beam?.state === 'playing') {
    return 'sonos'
  }
  return 'idle'
})

// Dynamic labels
const mediaTitle = computed(() => {
  if (activeSource.value === 'apple_tv') {
    return props.atv?.attributes.media_title || 'Watching Apple TV'
  }
  if (activeSource.value === 'sonos') {
    return props.beam?.attributes.media_title || 'Playing Music'
  }
  return 'TV'
})

const mediaSubtitle = computed(() => {
  if (activeSource.value === 'apple_tv') {
    return props.atv?.attributes.app_name || 'Apple TV'
  }
  if (activeSource.value === 'sonos') {
    return props.beam?.attributes.media_artist || 'Sonos'
  }
  return 'Idle'
})

const artworkUrl = computed(() => {
  const baseUrl = import.meta.env.VITE_HA_URL || 'http://chaos.local:8123'

  if (activeSource.value === 'apple_tv' && props.atv?.attributes.entity_picture) {
    return `${baseUrl}${props.atv.attributes.entity_picture}`
  }
  if (activeSource.value === 'sonos' && props.beam?.attributes.entity_picture) {
    return `${baseUrl}${props.beam.attributes.entity_picture}`
  }
  return null
})

const currentVolume = computed(() => {
  if (!props.beam) return 0
  return Math.round((props.beam.attributes.volume_level || 0) * 100)
})

// --- Live HA Service Callbacks ---

// Sends a direct raw decimal (0.0 to 1.0) back to the Sonos Beam
const adjustVolume = async (direction: 'up' | 'down') => {
  if (!props.beam) return

  try {
    const connection = await useHAConnection()
    const step = 0.05 // Adjust volume by 5% increments
    const currentLevel = props.beam.attributes.volume_level || 0

    let newLevel = direction === 'up' ? currentLevel + step : currentLevel - step
    // Clamp values safely between 0% and 100%
    newLevel = Math.max(0, Math.min(1, newLevel))

    await callService(connection, 'media_player', 'volume_set', {
      entity_id: props.beam.entity_id,
      volume_level: newLevel,
    })

    console.log(`Volume set to ${Math.round(newLevel * 100)}%`)
  } catch (error) {
    console.error('Failed to change Sonos volume:', error)
  }
}
</script>

<template>
  <div class="unified-tv-card" :class="{ 'is-active': isTvActive }">
    <!-- Background blurred album/movie art wrapper -->
    <div
      v-if="artworkUrl && isTvActive"
      class="card-backdrop-blur"
      :style="{ backgroundImage: `url(${artworkUrl})` }"
    ></div>

    <div class="card-content">
      <div class="media-meta-group">
        <!-- Unified Media Thumbnail -->
        <div class="artwork-container">
          <img v-if="artworkUrl" :src="artworkUrl" alt="Media Art" class="artwork-img" />
          <span v-else class="media-placeholder-icon">
            {{ activeSource === 'apple_tv' ? '📺' : '🎵' }}
          </span>
        </div>

        <!-- Metadata Text -->
        <div class="meta-details">
          <div class="meta-header">
            <span class="room-label">{{ displayRoomName }}</span>
            <span v-if="isTvActive" class="source-badge" :class="activeSource">
              {{ activeSource === 'apple_tv' ? 'TV' : 'Music' }}
            </span>
          </div>

          <h3 class="track-title">
            {{ mediaTitle }}
          </h3>
          <p class="track-subtitle">
            {{ mediaSubtitle }}
          </p>
        </div>
      </div>

      <!-- Unified Audio Controller Block -->
      <div v-if="beam" class="audio-controls-panel">
        <div class="volume-status">
          <span class="speaker-icon">🔊</span>
          <span class="volume-percentage">{{ currentVolume }}%</span>
        </div>

        <div class="btn-group">
          <button
            @click="adjustVolume('down')"
            class="btn-vol btn-vol-down"
            aria-label="Volume Down"
          >
            Vol -
          </button>
          <button @click="adjustVolume('up')" class="btn-vol btn-vol-up" aria-label="Volume Up">
            Vol +
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.unified-tv-card {
  position: relative;
  overflow: hidden;
  border-radius: 1rem;
  border: 1px solid rgb(30 41 59);
  background-color: rgb(15 23 42);
  padding: 1rem;
  color: rgb(255 255 255);
  box-shadow:
    0 4px 6px -1px rgb(0 0 0 / 0.1),
    0 2px 4px -2px rgb(0 0 0 / 0.1);
  transition: all 300ms;
}

.unified-tv-card.is-active {
  transform: scale(1.01);
  box-shadow:
    0 0 0 2px rgb(99 102 241),
    0 4px 6px -1px rgb(0 0 0 / 0.1),
    0 2px 4px -2px rgb(0 0 0 / 0.1);
}

.card-backdrop-blur {
  pointer-events: none;
  position: absolute;
  inset: 0;
  transform: scale(1.1);
  background-size: cover;
  background-position: center;
  opacity: 0.2;
  filter: blur(12px);
}

.card-content {
  position: relative;
  z-index: 10;
}

.media-meta-group {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.artwork-container {
  display: flex;
  height: 4rem;
  width: 4rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 0.5rem;
  border: 1px solid rgb(51 65 85);
  background-color: rgb(30 41 59);
}

.artwork-img {
  height: 100%;
  width: 100%;
  object-fit: cover;
}

.media-placeholder-icon {
  font-size: 1.25rem;
  line-height: 1.75rem;
}

.meta-details {
  min-width: 0;
  flex: 1 1 0%;
}

.meta-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.room-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.875rem;
  line-height: 1.25rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgb(148 163 184);
}

.source-badge {
  display: inline-flex;
  align-items: center;
  border-radius: 9999px;
  border: 1px solid rgb(51 65 85);
  background-color: rgb(30 41 59);
  padding: 0.125rem 0.5rem;
  font-size: 0.75rem;
  line-height: 1rem;
  font-weight: 600;
  color: rgb(203 213 225);
}

.source-badge.apple_tv {
  border-color: rgb(30 64 175);
  background-color: rgb(30 58 138 / 0.35);
  color: rgb(191 219 254);
}

.source-badge.sonos {
  border-color: rgb(20 83 45);
  background-color: rgb(20 83 45 / 0.35);
  color: rgb(187 247 208);
}

.track-title {
  margin-top: 0.125rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 1rem;
  line-height: 1.5rem;
  font-weight: 700;
  color: rgb(255 255 255);
}

.track-subtitle {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: rgb(203 213 225);
}

.audio-controls-panel {
  margin-top: 0.875rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  border-top: 1px solid rgb(51 65 85 / 0.8);
  padding-top: 0.75rem;
}

.volume-status {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  color: rgb(148 163 184);
}

.speaker-icon {
  font-size: 0.875rem;
  line-height: 1.25rem;
}

.volume-percentage {
  font-size: 0.875rem;
  line-height: 1.25rem;
  font-weight: 600;
}

.btn-group {
  display: inline-flex;
  gap: 0.5rem;
}

.btn-vol {
  border: 1px solid rgb(51 65 85);
  border-radius: 0.5rem;
  background-color: rgb(30 41 59);
  color: rgb(241 245 249);
  padding: 0.35rem 0.65rem;
  font-size: 0.75rem;
  line-height: 1rem;
  font-weight: 700;
  transition:
    background-color 160ms,
    border-color 160ms,
    transform 120ms;
}

.btn-vol:hover {
  background-color: rgb(51 65 85);
}

.btn-vol:active {
  transform: scale(0.98);
}

.btn-vol-down {
  border-color: rgb(100 116 139);
}

.btn-vol-up {
  border-color: rgb(79 70 229);
  background-color: rgb(67 56 202 / 0.2);
}

.btn-vol-up:hover {
  background-color: rgb(67 56 202 / 0.35);
}
</style>
