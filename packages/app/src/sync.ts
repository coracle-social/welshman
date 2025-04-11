import type {Filter} from "@welshman/util"
import {isSignedEvent, SignedEvent} from "@welshman/util"
import {
  push as basePush,
  pull as basePull,
  publishOne,
  requestOne,
} from "@welshman/net"
import {repository} from "./core.js"
import {relaysByUrl} from "./relays.js"

const query = (filters: Filter[]) =>
  repository.query(filters, {shouldSort: filters.every(f => f.limit === undefined)})

export const hasNegentropy = (url: string) => {
  const p = relaysByUrl.get().get(url)?.profile

  if (p?.supported_nips?.includes(77)) return true
  if (p?.software?.includes("strfry") && !p?.version?.match(/^0\./)) return true

  return false
}

export type AppSyncOpts = {
  relays: string[]
  filters: Filter[]
}

export const pull = async ({relays, filters}: AppSyncOpts) => {
  const events = query(filters).filter(isSignedEvent)

  await Promise.all(
    relays.map(async relay => {
      await (hasNegentropy(relay)
        ? basePull({filters, events, relays: [relay]})
        : requestOne({filters, relay, autoClose: true}))
    }),
  )
}

export const push = async ({relays, filters}: AppSyncOpts) => {
  const events = query(filters).filter(isSignedEvent)

  await Promise.all(
    relays.map(async relay => {
      await (hasNegentropy(relay)
        ? basePush({filters, events, relays: [relay]})
        : Promise.all(events.map((event: SignedEvent) => publishOne({event, relay}))))
    }),
  )
}
