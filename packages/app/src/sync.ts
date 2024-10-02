import type {Filter} from '@welshman/util'
import {isSignedEvent} from '@welshman/util'
import {push as basePush, pull as basePull, sync as baseSync, pushWithoutNegentropy, pullWithoutNegentropy, syncWithoutNegentropy} from "@welshman/net"
import {repository} from './core'
import {relaysByUrl} from './relays'

export const hasNegentropy = (url: string) => {
  const p = relaysByUrl.get().get(url)?.profile

  if (p?.supported_nips?.includes(77)) return true
  if (p?.software?.includes('strfry') && !p?.version?.match(/^0\./)) return true

  return false
}

export type AppSyncOpts = {
  relays: string[]
  filters: Filter[]
}

export const pull = async ({relays, filters}: AppSyncOpts) =>
  await Promise.all(
    relays.map(async relay => {
      const events = repository.query(filters)

      await hasNegentropy(relay)
        ? basePull({filters, events, relays: [relay]})
        : pullWithoutNegentropy({filters, relays: [relay]})
    })
  )

export const push = async ({relays, filters}: AppSyncOpts) =>
  await Promise.all(
    relays.map(async relay => {
      const events = repository.query(filters).filter(isSignedEvent)

      await hasNegentropy(relay)
        ? basePush({filters, events, relays: [relay]})
        : pushWithoutNegentropy({events, relays: [relay]})
    })
  )

export const sync = async ({relays, filters}: AppSyncOpts) =>
  await Promise.all(
    relays.map(async relay => {
      const events = repository.query(filters).filter(isSignedEvent)

      await hasNegentropy(relay)
        ? baseSync({filters, events, relays: [relay]})
        : syncWithoutNegentropy({filters, events, relays: [relay]})
    })
  )
