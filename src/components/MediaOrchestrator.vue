<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed } from 'vue'
import { useHAConnection } from '@/services/haService'
import { subscribeEntities, type HassEntities, type HassEntity } from 'home-assistant-js-websocket'
import MediaPlayerTile from '@/components/MediaPlayerTile.vue'
import UnifiedTvTile from '@/components/UnifiedTvTile.vue'

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
  <div class="home-view-zones-section">
    <h2 class="home-view-zones-title">Active Zones</h2>

    <UnifiedTvTile
      v-if="unifiedLivingRoom"
      :beam="unifiedLivingRoom.beam"
      :atv="unifiedLivingRoom.atv"
    />

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
</template>

<style scoped>
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
