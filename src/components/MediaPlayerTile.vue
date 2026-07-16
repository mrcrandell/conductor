<script setup lang="ts">
import { computed } from 'vue'
import type { HassEntity } from 'home-assistant-js-websocket'

const props = defineProps<{
  entity: HassEntity
  entityId: string
}>()

// Grab friendly name or fall back to the ID
const displayName = computed(() => {
  return props.entity.attributes.friendly_name || props.entityId
})

// Check if the device is actively streaming or playing content
const isPlaying = computed(() => {
  return props.entity.state === 'playing'
})

// Build a full image URL for album/media art if Home Assistant provides one
// Note: We point this to your HA_URL environment variable to grab the asset safely
const artworkUrl = computed(() => {
  const artPath = props.entity.attributes.entity_picture
  if (!artPath) return null

  const baseUrl = import.meta.env.VITE_HA_URL || 'http://chaos.local:8123'

  // Resolve relative HA media paths against HA base URL, but keep absolute URLs unchanged.
  try {
    return new URL(artPath, baseUrl).toString()
  } catch {
    return artPath
  }
})
</script>

<template>
  <div class="media-player-tile" :class="{ 'is-playing': isPlaying }">
    <!-- Background blurred album art for a gorgeous native UI feel -->
    <div
      v-if="artworkUrl && isPlaying"
      class="media-player-tile-backdrop"
      :style="{ backgroundImage: `url(${artworkUrl})` }"
    ></div>

    <div class="media-player-tile-content">
      <!-- Album/Media Art Thumbnail -->
      <div class="media-player-artwork-container">
        <img v-if="artworkUrl" :src="artworkUrl" alt="Media Art" class="media-player-artwork-img" />
        <!-- Fallback icon based on entity type -->
        <span v-else class="media-player-artwork-fallback">
          {{ entityId.includes('apple_tv') ? '📺' : '🎵' }}
        </span>
      </div>

      <!-- Track Information -->
      <div class="media-player-meta-details">
        <h3 class="media-player-label">{{ displayName }} {{ props.entity.state }}</h3>

        <div v-if="isPlaying" class="media-player-now-playing">
          <p class="media-player-track-title">
            {{ entity.attributes.media_title || 'Unknown Track' }}
          </p>
          <p class="media-player-track-artist">
            {{ entity.attributes.media_artist || 'Unknown Artist' }}
          </p>
        </div>

        <div v-else class="media-player-state-row">
          <span class="media-player-state-dot"></span>
          <span class="media-player-state-text">
            {{ entity.state }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.media-player-tile {
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

.media-player-tile.is-playing {
  transform: scale(1.01);
  box-shadow:
    0 0 0 2px rgb(99 102 241),
    0 4px 6px -1px rgb(0 0 0 / 0.1),
    0 2px 4px -2px rgb(0 0 0 / 0.1);
}

.media-player-tile-backdrop {
  pointer-events: none;
  position: absolute;
  inset: 0;
  transform: scale(1.1);
  background-size: cover;
  background-position: center;
  opacity: 0.2;
  filter: blur(12px);
}

.media-player-tile-content {
  position: relative;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 1rem;
}

.media-player-artwork-container {
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

.media-player-artwork-img {
  height: 100%;
  width: 100%;
  object-fit: cover;
}

.media-player-artwork-fallback {
  font-size: 1.25rem;
  line-height: 1.75rem;
}

.media-player-meta-details {
  min-width: 0;
  flex: 1 1 0%;
}

.media-player-label {
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

.media-player-now-playing {
  margin-top: 0.125rem;
}

.media-player-track-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 1rem;
  line-height: 1.5rem;
  font-weight: 700;
  color: rgb(255 255 255);
}

.media-player-track-artist {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: rgb(203 213 225);
}

.media-player-state-row {
  margin-top: 0.25rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.media-player-state-dot {
  height: 0.625rem;
  width: 0.625rem;
  border-radius: 9999px;
  background-color: rgb(71 85 105);
}

.media-player-state-text {
  font-size: 0.875rem;
  line-height: 1.25rem;
  font-weight: 500;
  text-transform: capitalize;
  color: rgb(148 163 184);
}
</style>
