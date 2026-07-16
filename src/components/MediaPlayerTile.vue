<script setup lang="ts">
import { computed } from 'vue'
import { callService } from 'home-assistant-js-websocket'
import type { HassEntity } from 'home-assistant-js-websocket'
import { useHAConnection } from '@/services/haService'

const props = defineProps<{
  entity: HassEntity
  entityId: string
  groupMembers?: HassEntity[]
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

const resolvedGroupMembers = computed(() => props.groupMembers || [])

const groupSpeakerRows = computed(() => {
  return [props.entity, ...resolvedGroupMembers.value]
})

const isVolumeBusy = computed(() => {
  return props.entity.state === 'unavailable'
})

const groupLabel = computed(() => {
  if (!resolvedGroupMembers.value.length) return null
  return `${displayName.value} Group (${resolvedGroupMembers.value.length + 1} Speakers)`
})

const adjustSpeakerVolume = async (
  targetEntityId: string,
  currentLevel: number,
  direction: 'up' | 'down',
) => {
  try {
    const connection = await useHAConnection()
    const step = 0.05
    let newLevel = direction === 'up' ? currentLevel + step : currentLevel - step
    newLevel = Math.max(0, Math.min(1, newLevel))

    await callService(connection, 'media_player', 'volume_set', {
      entity_id: targetEntityId,
      volume_level: newLevel,
    })
  } catch (error) {
    console.error('Failed to change speaker volume:', error)
  }
}

const unjoinSpeaker = async (targetEntityId: string) => {
  try {
    const connection = await useHAConnection()
    await callService(connection, 'media_player', 'unjoin', {
      entity_id: targetEntityId,
    })
  } catch (error) {
    console.error('Failed to unjoin speaker from group:', error)
  }
}
</script>

<template>
  <div class="media-player-tile" :class="{ 'is-playing': isPlaying }">
    <div v-if="groupLabel" class="media-player-group-badge">Grouped Zone: {{ groupLabel }}</div>

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

    <div v-if="resolvedGroupMembers.length > 0" class="media-player-group-panel">
      <div
        v-for="speaker in groupSpeakerRows"
        :key="speaker.entity_id"
        class="media-player-group-volume-row"
      >
        <div class="media-player-group-speaker-meta">
          <span class="media-player-group-speaker-name">
            {{ speaker.attributes.friendly_name || speaker.entity_id }}
          </span>
          <span class="media-player-group-speaker-volume">
            {{ Math.round((speaker.attributes.volume_level || 0) * 100) }}%
          </span>
        </div>

        <div class="media-player-group-controls">
          <button
            class="media-player-group-btn"
            :disabled="isVolumeBusy"
            @click="
              adjustSpeakerVolume(speaker.entity_id, speaker.attributes.volume_level || 0, 'down')
            "
            aria-label="Lower speaker volume"
          >
            -
          </button>
          <button
            class="media-player-group-btn"
            :disabled="isVolumeBusy"
            @click="
              adjustSpeakerVolume(speaker.entity_id, speaker.attributes.volume_level || 0, 'up')
            "
            aria-label="Raise speaker volume"
          >
            +
          </button>
          <button
            v-if="speaker.entity_id !== entityId"
            class="media-player-group-unjoin-btn"
            @click="unjoinSpeaker(speaker.entity_id)"
            aria-label="Ungroup speaker"
          >
            Ungroup
          </button>
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

.media-player-group-badge {
  position: relative;
  z-index: 10;
  margin-bottom: 0.625rem;
  display: inline-flex;
  border-radius: 9999px;
  border: 1px solid rgb(30 64 175 / 0.9);
  background-color: rgb(30 58 138 / 0.25);
  padding: 0.2rem 0.625rem;
  font-size: 0.75rem;
  line-height: 1rem;
  font-weight: 600;
  color: rgb(191 219 254);
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

.media-player-group-panel {
  position: relative;
  z-index: 10;
  margin-top: 0.875rem;
  display: grid;
  gap: 0.5rem;
  border-top: 1px solid rgb(51 65 85 / 0.7);
  padding-top: 0.75rem;
}

.media-player-group-volume-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.media-player-group-speaker-meta {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.5rem;
}

.media-player-group-speaker-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.8125rem;
  line-height: 1.125rem;
  color: rgb(226 232 240);
}

.media-player-group-speaker-volume {
  font-size: 0.75rem;
  line-height: 1rem;
  font-weight: 700;
  color: rgb(148 163 184);
}

.media-player-group-controls {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
}

.media-player-group-btn,
.media-player-group-unjoin-btn {
  border: 1px solid rgb(51 65 85);
  border-radius: 0.45rem;
  background-color: rgb(30 41 59);
  color: rgb(241 245 249);
  padding: 0.2rem 0.5rem;
  font-size: 0.75rem;
  line-height: 1rem;
  font-weight: 700;
  transition: background-color 160ms;
}

.media-player-group-btn:hover,
.media-player-group-unjoin-btn:hover {
  background-color: rgb(51 65 85);
}

.media-player-group-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.media-player-group-unjoin-btn {
  border-color: rgb(100 116 139);
}
</style>
