import {isSignedEvent} from "@welshman/util"
import type {Filter, SignedEvent} from "@welshman/util"
import type {ClientContext} from "./client.js"
import type {Relays} from "./relays.js"

export type AppSyncOpts = {
  relays: string[]
  filters: Filter[]
}

/**
 * Negentropy-aware sync. Pulls/pushes events between the local repository and a
 * set of relays, using NIP-77 reconciliation where the relay supports it and
 * falling back to plain request/publish otherwise. Reads NIP-11 relay profiles
 * from the injected `Relays` collection to detect negentropy support.
 */
export class Sync {
  constructor(
    readonly ctx: ClientContext,
    readonly relays: Relays,
  ) {}

  query = (filters: Filter[]) =>
    this.ctx.repository.query(filters, {shouldSort: filters.every(f => f.limit === undefined)})

  hasNegentropy = (url: string) => {
    const relay = this.relays.get(url)

    if (relay?.negentropy) return true
    if (relay?.supported_nips?.includes?.("77")) return true
    if (relay?.software?.includes?.("strfry") && !relay?.version?.match(/^0\./)) return true

    return false
  }

  pull = async ({relays, filters}: AppSyncOpts) => {
    const events = this.query(filters).filter(isSignedEvent)

    await Promise.all(
      relays.map(async relay => {
        await (this.hasNegentropy(relay)
          ? this.ctx.pull({filters, events, relays: [relay]})
          : this.ctx.request({filters, relays: [relay], autoClose: true}))
      }),
    )
  }

  push = async ({relays, filters}: AppSyncOpts) => {
    const events = this.query(filters).filter(isSignedEvent)

    await Promise.all(
      relays.map(async relay => {
        await (this.hasNegentropy(relay)
          ? this.ctx.push({filters, events, relays: [relay]})
          : Promise.all(
              events.map((event: SignedEvent) => this.ctx.publish({event, relays: [relay]})),
            ))
      }),
    )
  }
}
