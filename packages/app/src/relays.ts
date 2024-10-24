import {writable, derived} from 'svelte/store'
import {withGetter} from '@welshman/store'
import {ctx, groupBy, indexBy, batch, now, uniq, batcher, postJson} from '@welshman/lib'
import type {RelayProfile} from "@welshman/util"
import {normalizeRelayUrl, displayRelayUrl, displayRelayProfile} from "@welshman/util"
import {asMessage, type Connection, type SocketMessage} from '@welshman/net'
import {collection} from './collection'

export type RelayStats = {
  first_seen: number
  event_count: number
  request_count: number
  publish_count: number
  connect_count: number
  recent_errors: number[]
}

// Relays

export const makeRelayStats = (): RelayStats => ({
  first_seen: now(),
  event_count: 0,
  request_count: 0,
  publish_count: 0,
  connect_count: 0,
  recent_errors: [],
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

export const fetchRelayProfiles = async (urls: string[]) => {
  const base = ctx.app.dufflepudUrl!

  if (!base) {
    throw new Error("ctx.app.dufflepudUrl is required to fetch relay metadata")
  }

  const res: any = await postJson(`${base}/relay/info`, {urls})
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
  load: batcher(800, async (rawUrls: string[]) => {
    const urls = rawUrls.map(normalizeRelayUrl)
    const fresh = await fetchRelayProfiles(uniq(urls))
    const stale = relaysByUrl.get()

    for (const url of urls) {
      const relay = stale.get(url)
      const profile = fresh.get(url)

      if (profile) {
        stale.set(url, {...relay, profile, url})
      }
    }

    relays.set(Array.from(stale.values()))

    return urls
  }),
})

export const displayRelayByPubkey = (url: string) =>
  displayRelayProfile(relaysByUrl.get().get(url)?.profile, displayRelayUrl(url))

export const deriveRelayDisplay = (url: string) =>
  derived(deriveRelay(url), $relay => displayRelayProfile($relay?.profile, displayRelayUrl(url)))

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
