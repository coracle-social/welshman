import {isSignedEvent} from "@welshman/util"
import type {Filter, SignedEvent} from "@welshman/util"
import {pull, push} from "@welshman/net"
import type {IApp} from "../app.js"
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
  constructor(readonly app: IApp) {}

  query = (filters: Filter[]) =>
    this.app.repository.query(filters, {shouldSort: filters.every(f => f.limit === undefined)})

  pull = async ({relays, filters}: AppSyncOpts) => {
    const net = this.app.use(Network)
    const events = this.query(filters).filter(isSignedEvent)

    await Promise.all(
      relays.map(async relay => {
        if (await this.app.use(Relays).hasNegentropy(relay)) {
          await pull({filters, events, relays: [relay], context: this.app.netContext})
        } else {
          await net.request({filters, relays: [relay], autoClose: true})
        }
      }),
    )
  }

  push = async ({relays, filters}: AppSyncOpts) => {
    const net = this.app.use(Network)
    const events = this.query(filters).filter(isSignedEvent)

    await Promise.all(
      relays.map(async relay => {
        if (await this.app.use(Relays).hasNegentropy(relay)) {
          await push({filters, events, relays: [relay], context: this.app.netContext})
        } else {
          await Promise.all(
            events.map((event: SignedEvent) => net.publish({event, relays: [relay]})),
          )
        }
      }),
    )
  }
}
