import {flatten} from '@welshman/lib'
import {push as basePush, pull as basePull, sync as baseSync, pushWithoutNegentropy, pullWithoutNegentropy, syncWithoutNegentropy} from "@welshman/net"
import type {PullOpts, PushOpts, SyncOpts} from "@welshman/net"
import {relaysByUrl} from './relays'

export const hasNegentropy = (url: string) => {
  const p = relaysByUrl.get().get(url)?.profile

  if (p?.supported_nips?.includes(77)) return true
  if (p?.software?.includes('strfry') && !p?.version?.match(/^0\./)) return true

  return false
}

export const pull = async (opts: PullOpts) =>
  flatten(
    await Promise.all(
      opts.relays.map(relay =>
        hasNegentropy(relay)
          ? basePull({...opts, relays: [relay]})
          : pullWithoutNegentropy({...opts, relays: [relay]})
      )
    )
  )

export const push = async (opts: PushOpts) =>
  flatten(
    await Promise.all(
      opts.relays.map(relay =>
        hasNegentropy(relay)
          ? basePush({...opts, relays: [relay]})
          : pushWithoutNegentropy({...opts, relays: [relay]})
      )
    )
  )

export const sync = async (opts: SyncOpts) =>
  flatten(
    await Promise.all(
      opts.relays.map(relay =>
        hasNegentropy(relay)
          ? baseSync({...opts, relays: [relay]})
          : syncWithoutNegentropy({...opts, relays: [relay]})
      )
    )
  )

