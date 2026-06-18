import {isSignedEvent} from "@welshman/util"
import type {Filter, SignedEvent} from "@welshman/util"
import type {IClient} from "../client.js"
import {Network} from "./network.js"
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

  pull = async ({relays, filters}: AppSyncOpts) => {
    const net = this.ctx.use(Network)
    const events = this.query(filters).filter(isSignedEvent)

    await Promise.all(
      relays.map(async relay => {
        if (await this.ctx.use(Relays).hasNegentropy(relay)) {
          await net.pull({filters, events, relays: [relay]})
        } else {
          await net.request({filters, relays: [relay], autoClose: true})
        }
      }),
    )
  }

  push = async ({relays, filters}: AppSyncOpts) => {
    const net = this.ctx.use(Network)
    const events = this.query(filters).filter(isSignedEvent)

    await Promise.all(
      relays.map(async relay => {
        if (await this.ctx.use(Relays).hasNegentropy(relay)) {
          await net.push({filters, events, relays: [relay]})
        } else {
          await Promise.all(events.map((event: SignedEvent) => net.publish({event, relays: [relay]})))
        }
      }),
    )
  }
}
