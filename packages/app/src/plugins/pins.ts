import {PINS} from "@welshman/util"
import {PinList, PinListReader, PinListWriter} from "@welshman/domain"
import {DerivedPlugin} from "./base.js"
import {Network} from "./network.js"
import {Domain} from "./domain.js"
import type {IApp} from "../app.js"

/**
 * NIP-51 pin lists (kind 10001), keyed by pubkey. Loaded via the outbox model
 * (the author's write relays), so it depends on the relay-list collection.
 */
export class PinLists extends DerivedPlugin<PinListReader> {
  constructor(app: IApp) {
    super(app, {
      filters: [{kinds: [PINS]}],
      eventToItem: app.use(Domain).reader(PinList),
      getKey: pins => pins.author(),
    })
  }

  fetch(pubkey: string, relayHints: string[] = []) {
    return this.app.use(Network).loadUsingOutbox(pubkey, {kinds: [PINS]}, relayHints)
  }

  update = (fn: (writer: PinListWriter) => void) =>
    this.app.use(Domain).update(PinList, this.forceLoad, fn)

  pin = (tag: string[]) => this.update(writer => writer.pinPublicly(tag))

  unpin = (value: string) => this.update(writer => writer.unpin(value))
}
