import {writable, derived} from 'svelte/store'
import {withGetter} from '@welshman/store'
import {groupBy, indexBy, batch, now, uniq, uniqBy, batcher, postJson} from '@welshman/lib'
import {type RelayProfile} from "@welshman/util"
import {AuthStatus, asMessage, type Connection, type SocketMessage} from '@welshman/net'
import {AppContext} from './core'
import {createSearch} from './util'
import {collection} from './collection'

export type RelayStats = {
  first_seen: number
  event_count: number
  request_count: number
  publish_count: number
  connect_count: number
  recent_errors: number[]
  last_auth_status: AuthStatus
}

// Relays

export const makeRelayStats = (): RelayStats => ({
  first_seen: now(),
  event_count: 0,
  request_count: 0,
  publish_count: 0,
  connect_count: 0,
  recent_errors: [],
  last_auth_status: AuthStatus.Pending,
})

export type Relay = {
  url: string
  stats?: RelayStats
  profile?: RelayProfile
}

export const relays = withGetter(writable<Relay[]>([]))

export const relaysByPubkey = derived(relays, $relays =>
  groupBy(
    $relay => $relay.profile?.pubkey,
    $relays.filter($relay => $relay.profile?.pubkey),
  ),
)

export const fetchRelayProfiles = (urls: string[]) => {
  const base = AppContext.dufflepudUrl!

  if (!base) {
    throw new Error("AppContext.dufflepudUrl is required to fetch relay metadata")
  }

  const res: any = postJson(`${base}/relay/info`, {urls})
  const profilesByUrl = new Map<string, RelayProfile>()

  for (const {url, info} of res?.data || []) {
    profilesByUrl.set(url, info)
  }

  return profilesByUrl
}

export const {
  indexStore: relaysByUrl,
  deriveItem: deriveRelay,
  loadItem: loadRelay,
} = collection({
  name: "relays",
  store: relays,
  getKey: (relay: Relay) => relay.url,
  load: batcher(800, async (urls: string[]) => {
    const profilesByUrl = await fetchRelayProfiles(uniq(urls))
    const index = relaysByUrl.get()
    const items: Relay[] = urls.map(url => {
      const relay = index.get(url)
      const profile = profilesByUrl.get(url) || relay?.profile

      return {...relay, profile, url}
    })

    relays.update($relays => uniqBy($relay => $relay.url, [...$relays, ...items]))

    return items
  }),
})

export const relaySearch = derived(relays, $relays =>
  createSearch($relays, {
    getValue: (relay: Relay) => relay.url,
    fuseOptions: {
      keys: ["url", "name", {name: "description", weight: 0.3}],
    },
  }),
)

// Utilities for syncing stats from connections to relays

type RelayStatsUpdate = [string, (stats: RelayStats) => void]

const updateRelayStats = batch(500, (updates: RelayStatsUpdate[]) => {
  relays.update($relays => {
    const $relaysByUrl = indexBy(r => r.url, $relays)
    const $itemsByUrl = groupBy(([url]) => url, updates)

    for (const [url, items] of $itemsByUrl.entries()) {
      const $relay: Relay = $relaysByUrl.get(url) || {url}

      if (!$relay.stats) {
        $relay.stats = makeRelayStats()
      }

      for (const [_, update] of items) {
        update($relay.stats)
      }

      $relaysByUrl.set(url, $relay)
    }

    return Array.from($relaysByUrl.values())
  })
})

const onConnectionSend = ({url}: Connection, socketMessage: SocketMessage) => {
  const [verb] = asMessage(socketMessage)

  if (verb === 'REQ') {
    updateRelayStats([url, stats => ++stats.request_count])
  } else if (verb === 'EVENT') {
    updateRelayStats([url, stats => ++stats.publish_count])
  }
}

const onConnectionReceive = ({url}: Connection, socketMessage: SocketMessage) => {
  const [verb] = asMessage(socketMessage)

  if (verb === 'EVENT') {
    updateRelayStats([url, stats => ++stats.event_count])
  } else if (verb === 'OK') {
    updateRelayStats([url, stats => {
      stats.last_auth_status = AuthStatus.Ok
    }])
  } else if (verb === 'AUTH') {
    updateRelayStats([url, stats => {
      stats.last_auth_status = AuthStatus.Unauthorized
    }])
  }
}

const onConnectionFault = ({url}: Connection) =>
  updateRelayStats([url, stats => {
    stats.recent_errors = stats.recent_errors.concat(now()).slice(-10)
  }])

export const trackRelayStats = (connection: Connection) => {
  updateRelayStats([connection.url, stats => ++stats.connect_count])

  connection.on('send', onConnectionSend)
  connection.on('receive', onConnectionReceive)
  connection.on('fault', onConnectionFault)

  return () => {
    connection.off('send', onConnectionSend)
    connection.off('receive', onConnectionReceive)
    connection.off('fault', onConnectionFault)
  }
}
