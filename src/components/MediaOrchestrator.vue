<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed } from 'vue'
import { useHAConnection } from '@/services/haService'
import { subscribeEntities, type HassEntities, type HassEntity } from 'home-assistant-js-websocket'
import MediaPlayerTile from '@/components/MediaPlayerTile.vue'
import UnifiedTvTile from '@/components/UnifiedTvTile.vue'

type AreaRegistryEntry = {
  area_id: string
  name: string
}

type DeviceRegistryEntry = {
  id: string
  area_id: string | null
}

type EntityRegistryEntry = {
  entity_id: string
  device_id: string | null
  area_id: string | null
  hidden_by: string | null
  labels?: string[]
  label_ids?: string[]
}

type PlayerCard = {
  id: string
  data: HassEntity
  groupMembers: HassEntity[]
  areaKey: string
}

type RoomSection = {
  key: string
  label: string
  unified: { beam: HassEntity | null; atv: HassEntity | null } | null
  players: PlayerCard[]
}

const TV_KEYWORDS = ['apple_tv', 'tv', 'chromecast', 'roku', 'shield', 'fire_tv']
const AUDIO_KEYWORDS = ['sonos', 'speaker', 'soundbar', 'receiver', 'beam', 'arc', 'move']
const MEDIA_LABEL_ID = 'conductor_media'

const entities = ref<HassEntities | null>(null)
const areas = ref<AreaRegistryEntry[]>([])
const devices = ref<DeviceRegistryEntry[]>([])
const entityRegistry = ref<EntityRegistryEntry[]>([])
const activeView = ref('all')
let unsubscribe: (() => void) | null = null

const getAreaKey = (areaId: string | null | undefined) => areaId || 'unassigned'

const normalize = (value: string | null | undefined) => (value || '').toLowerCase()

const hasKeyword = (value: string, keywords: string[]) =>
  keywords.some((keyword) => value.includes(keyword))

const isTvLike = (entity: HassEntity) => {
  const id = normalize(entity.entity_id)
  const friendlyName = normalize(entity.attributes.friendly_name)
  return hasKeyword(id, TV_KEYWORDS) || hasKeyword(friendlyName, TV_KEYWORDS)
}

const isAudioLike = (entity: HassEntity) => {
  const id = normalize(entity.entity_id)
  const friendlyName = normalize(entity.attributes.friendly_name)
  return hasKeyword(id, AUDIO_KEYWORDS) || hasKeyword(friendlyName, AUDIO_KEYWORDS)
}

onMounted(async () => {
  try {
    const connection = await useHAConnection()

    const [areaRegistry, deviceRegistry, entityRegistryList] = await Promise.all([
      connection.sendMessagePromise({ type: 'config/area_registry/list' }),
      connection.sendMessagePromise({ type: 'config/device_registry/list' }),
      connection.sendMessagePromise({ type: 'config/entity_registry/list' }),
    ])

    areas.value = (areaRegistry as AreaRegistryEntry[]) || []
    devices.value = (deviceRegistry as DeviceRegistryEntry[]) || []
    entityRegistry.value = (entityRegistryList as EntityRegistryEntry[]) || []

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

const deviceAreaById = computed(() => {
  return devices.value.reduce(
    (acc, device) => {
      acc[device.id] = device.area_id
      return acc
    },
    {} as Record<string, string | null>,
  )
})

const entityRegistryById = computed(() => {
  return entityRegistry.value.reduce(
    (acc, entityEntry) => {
      acc[entityEntry.entity_id] = entityEntry
      return acc
    },
    {} as Record<string, EntityRegistryEntry>,
  )
})

const areaLabelByKey = computed(() => {
  const labelMap: Record<string, string> = {
    unassigned: 'Unassigned',
  }

  for (const area of areas.value) {
    labelMap[area.area_id] = area.name
  }

  return labelMap
})

const mediaPlayers = computed(() => {
  if (!entities.value) return []

  const labeledEntityIds = entityRegistry.value
    .filter((entry) => {
      const labels = [...(entry.labels || []), ...(entry.label_ids || [])]

      return (
        entry.entity_id.startsWith('media_player.') &&
        !entry.hidden_by &&
        labels.includes(MEDIA_LABEL_ID)
      )
    })
    .map((entry) => entry.entity_id)

  return labeledEntityIds
    .map((entityId) => entities.value?.[entityId])
    .filter((entity): entity is HassEntity => !!entity)
})

const playerAreaKeyById = computed(() => {
  const map: Record<string, string> = {}

  for (const player of mediaPlayers.value) {
    const registryEntry = entityRegistryById.value[player.entity_id]
    const areaIdFromEntity = registryEntry?.area_id
    const areaIdFromDevice = registryEntry?.device_id
      ? deviceAreaById.value[registryEntry.device_id]
      : null

    map[player.entity_id] = getAreaKey(areaIdFromEntity || areaIdFromDevice)
  }

  return map
})

const processedMediaPlayers = computed(() => {
  const allPlayers = mediaPlayers.value
  if (!allPlayers.length) return [] as PlayerCard[]

  const activeTargetIds = allPlayers.map((entity) => entity.entity_id)
  const processedIds = new Set<string>()
  const outputPlayers: PlayerCard[] = []

  for (const entity of allPlayers) {
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
      const peerWithGroup = allPlayers.find((candidate) => {
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
      activeTargetIds.includes(id),
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

      const coordinatorEntity = entities.value?.[coordinatorId] || entity
      const members = activeGroupIds
        .filter((id) => id !== coordinatorId)
        .map((id) => entities.value?.[id])
        .filter((member): member is HassEntity => !!member)

      outputPlayers.push({
        id: coordinatorId,
        data: coordinatorEntity,
        groupMembers: members,
        areaKey: playerAreaKeyById.value[coordinatorId] || 'unassigned',
      })

      activeGroupIds.forEach((id) => processedIds.add(id))
      continue
    }

    outputPlayers.push({
      id: entityId,
      data: entity,
      groupMembers: [],
      areaKey: playerAreaKeyById.value[entityId] || 'unassigned',
    })
    processedIds.add(entityId)
  }

  return outputPlayers
})

const roomSections = computed(() => {
  const sectionsByKey: Record<string, RoomSection> = {}

  for (const player of processedMediaPlayers.value) {
    const key = player.areaKey
    if (!sectionsByKey[key]) {
      sectionsByKey[key] = {
        key,
        label: areaLabelByKey.value[key] || 'Unassigned',
        unified: null,
        players: [],
      }
    }

    sectionsByKey[key].players.push(player)
  }

  for (const [areaKey, section] of Object.entries(sectionsByKey)) {
    const areaEntities = mediaPlayers.value.filter(
      (entity) => (playerAreaKeyById.value[entity.entity_id] || 'unassigned') === areaKey,
    )

    const tvEntity = areaEntities.find((entity) => isTvLike(entity)) || null
    const audioEntity =
      areaEntities.find((entity) => isAudioLike(entity) && entity !== tvEntity) || null

    if (tvEntity && audioEntity) {
      section.unified = {
        beam: audioEntity,
        atv: tvEntity,
      }

      section.players = section.players.filter(
        (player) => player.id !== tvEntity.entity_id && player.id !== audioEntity.entity_id,
      )
    }
  }

  return Object.values(sectionsByKey).sort((a, b) => a.label.localeCompare(b.label))
})

const availableViews = computed(() => {
  return [
    { key: 'all', label: 'All Zones' },
    ...roomSections.value.map((section) => ({
      key: section.key,
      label: section.label,
    })),
  ]
})

const activeViewKey = computed(() => {
  const known = availableViews.value.some((view) => view.key === activeView.value)
  return known ? activeView.value : 'all'
})

const activeSections = computed(() => {
  if (activeViewKey.value === 'all') return roomSections.value
  return roomSections.value.filter((section) => section.key === activeViewKey.value)
})

const hasAnyMedia = computed(() => {
  return activeSections.value.some((section) => section.unified || section.players.length > 0)
})

const setActiveView = (viewKey: string) => {
  activeView.value = viewKey
}
</script>

<template>
  <div class="media-orchestrator-root">
    <div class="media-orchestrator-header">
      <h2 class="home-view-zones-title">Active Zones</h2>

      <div class="media-orchestrator-view-selector">
        <button
          v-for="view in availableViews"
          :key="view.key"
          class="media-orchestrator-view-btn"
          :class="{ 'is-active': activeViewKey === view.key }"
          @click="setActiveView(view.key)"
        >
          {{ view.label }}
        </button>
      </div>
    </div>

    <div v-if="hasAnyMedia" class="media-orchestrator-stage">
      <div
        v-for="section in activeSections"
        :key="section.key"
        class="media-orchestrator-room-section"
      >
        <h3 v-if="activeViewKey === 'all'" class="media-orchestrator-room-title">
          {{ section.label }}
        </h3>

        <UnifiedTvTile
          v-if="section.unified"
          :beam="section.unified.beam || undefined"
          :atv="section.unified.atv || undefined"
          :room-name="section.label"
        />

        <div v-if="section.players.length > 0" class="home-view-player-grid">
          <MediaPlayerTile
            v-for="player in section.players"
            :key="player.id"
            :entity-id="player.id"
            :entity="player.data"
            :group-members="player.groupMembers"
          />
        </div>
      </div>
    </div>

    <div v-else class="media-orchestrator-empty">No media players found.</div>
  </div>
</template>

<style scoped>
.media-orchestrator-root {
  display: grid;
  gap: 1rem;
}

.media-orchestrator-header {
  display: grid;
  gap: 0.75rem;
}

.media-orchestrator-view-selector {
  display: flex;
  gap: 0.5rem;
  overflow-x: auto;
  padding-bottom: 0.25rem;
  scrollbar-width: none;
}

.media-orchestrator-view-selector::-webkit-scrollbar {
  display: none;
}

.media-orchestrator-view-btn {
  border: 1px solid rgb(51 65 85);
  border-radius: 9999px;
  background-color: rgb(15 23 42);
  color: rgb(148 163 184);
  padding: 0.45rem 0.75rem;
  font-size: 0.75rem;
  line-height: 1rem;
  font-weight: 700;
  white-space: nowrap;
  transition:
    border-color 160ms,
    background-color 160ms,
    color 160ms;
}

.media-orchestrator-view-btn:hover {
  border-color: rgb(71 85 105);
  background-color: rgb(30 41 59);
  color: rgb(226 232 240);
}

.media-orchestrator-view-btn.is-active {
  border-color: rgb(30 64 175);
  background-color: rgb(30 58 138);
  color: rgb(255 255 255);
}

.home-view-zones-title {
  font-size: 1.125rem;
  line-height: 1.75rem;
  font-weight: 600;
  color: rgb(203 213 225);
}

.media-orchestrator-stage {
  display: grid;
  gap: 1.25rem;
}

.media-orchestrator-room-section {
  display: grid;
  gap: 0.75rem;
}

.media-orchestrator-room-title {
  font-size: 0.75rem;
  line-height: 1rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgb(100 116 139);
}

.home-view-player-grid {
  display: grid;
  grid-template-columns: repeat(1, minmax(0, 1fr));
  gap: 1rem;
}

.media-orchestrator-empty {
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: rgb(100 116 139);
}
</style>
