import {isSignedEvent} from "@welshman/util"
import type {Filter, SignedEvent} from "@welshman/util"
import type {IClient} from "./client.js"
import {Networking} from "./networking.js"
import {Relays} from "./relays.js"

export type AppSyncOpts = {
  relays: string[]
  filters: Filter[]
}

/**
 * Negentropy-aware sync. Pulls/pushes events between the local repository and a
 * set of relays, using NIP-77 reconciliation where the relay supports it and
 * falling back to plain request/publish otherwise. Reads NIP-11 relay profiles
 * from the `Relays` collection to detect negentropy support.
 */
export class Sync {
  constructor(readonly ctx: IClient) {}

  query = (filters: Filter[]) =>
    this.ctx.repository.query(filters, {shouldSort: filters.every(f => f.limit === undefined)})

  hasNegentropy = (url: string) => {
    const relay = this.ctx.use(Relays).get(url)

    if (relay?.negentropy) return true
    if (relay?.supported_nips?.includes?.("77")) return true
    if (relay?.software?.includes?.("strfry") && !relay?.version?.match(/^0\./)) return true

    return false
  }

  pull = async ({relays, filters}: AppSyncOpts) => {
    const net = this.ctx.use(Networking)
    const events = this.query(filters).filter(isSignedEvent)

    await Promise.all(
      relays.map(async relay => {
        await (this.hasNegentropy(relay)
          ? net.pull({filters, events, relays: [relay]})
          : net.request({filters, relays: [relay], autoClose: true}))
      }),
    )
  }

  push = async ({relays, filters}: AppSyncOpts) => {
    const net = this.ctx.use(Networking)
    const events = this.query(filters).filter(isSignedEvent)

    await Promise.all(
      relays.map(async relay => {
        await (this.hasNegentropy(relay)
          ? net.push({filters, events, relays: [relay]})
          : Promise.all(events.map((event: SignedEvent) => net.publish({event, relays: [relay]}))))
      }),
    )
  }
}
