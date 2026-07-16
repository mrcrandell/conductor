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

const mediaPlayerTargets = [
  'media_player.office_speakers',
  'media_player.turntable',
  'media_player.sonos_move',
  'media_player.bedroom_clock',
]

// 1. Build grouped Sonos zones so grouped members render as one card.
const processedMediaPlayers = computed(() => {
  if (!entities.value) return []

  const activeTargets = mediaPlayerTargets
    .map((id) => entities.value?.[id])
    .filter((entity): entity is HassEntity => !!entity)

  const processedIds = new Set<string>()
  const outputPlayers: Array<{ id: string; data: HassEntity; groupMembers: HassEntity[] }> = []

  for (const entity of activeTargets) {
    const entityId = entity.entity_id
    if (processedIds.has(entityId)) continue

    const ownSonosGroup = Array.isArray(entity.attributes.sonos_group)
      ? (entity.attributes.sonos_group as string[])
      : []

    const ownGroupMembers = Array.isArray(entity.attributes.group_members)
      ? (entity.attributes.group_members as string[])
      : []

    // Some Sonos entities occasionally expose incomplete group data. If this entity doesn't
    // report a full group itself, infer it from peer entities that do include this ID.
    let inferredPeerGroup: string[] = []
    if (ownSonosGroup.length <= 1 && ownGroupMembers.length <= 1) {
      const peerWithGroup = activeTargets.find((candidate) => {
        const candidateSonosGroup = Array.isArray(candidate.attributes.sonos_group)
          ? (candidate.attributes.sonos_group as string[])
          : []
        const candidateGroupMembers = Array.isArray(candidate.attributes.group_members)
          ? (candidate.attributes.group_members as string[])
          : []

        return (
          candidate.entity_id !== entityId &&
          (candidateSonosGroup.includes(entityId) || candidateGroupMembers.includes(entityId))
        )
      })

      if (peerWithGroup) {
        inferredPeerGroup = [
          ...(Array.isArray(peerWithGroup.attributes.sonos_group)
            ? (peerWithGroup.attributes.sonos_group as string[])
            : []),
          ...(Array.isArray(peerWithGroup.attributes.group_members)
            ? (peerWithGroup.attributes.group_members as string[])
            : []),
        ]
      }
    }

    const candidateGroupIds = [entityId, ...ownSonosGroup, ...ownGroupMembers, ...inferredPeerGroup]
    const activeGroupIds = [...new Set(candidateGroupIds)].filter((id) =>
      mediaPlayerTargets.includes(id),
    )

    if (activeGroupIds.length > 1) {
      const playingCoordinator = activeGroupIds.find((id) => {
        const candidate = entities.value?.[id]
        return candidate?.state === 'playing' || candidate?.state === 'paused'
      })

      const coordinatorId = playingCoordinator || activeGroupIds[0] || entityId

      if (entityId !== coordinatorId) {
        processedIds.add(entityId)
        continue
      }

      const members = activeGroupIds
        .filter((id) => id !== coordinatorId)
        .map((id) => entities.value?.[id])
        .filter((member): member is HassEntity => !!member)

      outputPlayers.push({
        id: coordinatorId,
        data: entity,
        groupMembers: members,
      })

      activeGroupIds.forEach((id) => processedIds.add(id))
      continue
    }

    outputPlayers.push({
      id: entityId,
      data: entity,
      groupMembers: [],
    })
    processedIds.add(entityId)
  }

  return outputPlayers
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

        <!-- Solo and Grouped Media Players -->
        <div v-if="processedMediaPlayers.length > 0" class="home-view-player-grid">
          <MediaPlayerTile
            v-for="player in processedMediaPlayers"
            :key="player.id"
            :entity-id="player.id"
            :entity="player.data"
            :group-members="player.groupMembers"
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
