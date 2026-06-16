import {get, writable} from "svelte/store"
import type {Unsubscriber} from "svelte/store"
import {on, TaskQueue} from "@welshman/lib"
import {WRAP, getPubkeyTagValues} from "@welshman/util"
import type {TrustedEvent, SignedEvent} from "@welshman/util"
import {Nip59} from "@welshman/signer"
import type {ClientContext} from "./client.js"

export type GiftWrapsOptions = {
  shouldUnwrap?: boolean
}

/**
 * Per-client gift-wrap (NIP-59) ingestion. Watches the client's repository for
 * kind-1059 wraps and unwraps the ones addressed to THIS client's user, storing
 * the resulting rumors via the wrap manager.
 *
 * In the old global model a single queue tried every logged-in account's signer
 * against every wrap, depositing all rumors into one shared repository — which
 * is exactly how DM history got merged across accounts. Here a client only ever
 * unwraps its own user's messages into its own repository.
 */
export class GiftWraps {
  shouldUnwrap = writable(false)
  failedUnwraps = new Set<string>()
  queue: TaskQueue<TrustedEvent>
  cleanup: Unsubscriber

  constructor(
    readonly ctx: ClientContext,
    options: GiftWrapsOptions = {},
  ) {
    this.shouldUnwrap.set(options.shouldUnwrap ?? false)

    this.queue = new TaskQueue<TrustedEvent>({
      batchSize: 5,
      batchDelay: 30,
      processItem: async (wrap: TrustedEvent) => {
        const signer = this.ctx.user?.signer
        const recipient = this.ctx.user?.pubkey

        // Only unwrap messages addressed to our user
        if (!signer || !recipient || !getPubkeyTagValues(wrap.tags).includes(recipient)) {
          return
        }

        try {
          const rumor = await Nip59.fromSigner(signer).unwrap(wrap as SignedEvent)

          this.ctx.wrapManager.add({wrap: wrap as SignedEvent, rumor, recipient})
        } catch (e) {
          this.failedUnwraps.add(wrap.id)
        }
      },
    })

    // Process wraps already in the repository, then any that arrive later
    for (const wrap of this.ctx.repository.query([{kinds: [WRAP]}])) {
      this.enqueue(wrap)
    }

    this.cleanup = on(this.ctx.repository, "update", ({added}: {added: TrustedEvent[]}) => {
      for (const event of added) {
        if (event.kind === WRAP) {
          this.enqueue(event)
        }
      }
    })
  }

  enqueue = (wrap: TrustedEvent) => {
    if (!get(this.shouldUnwrap)) return
    if (this.failedUnwraps.has(wrap.id)) return
    if (this.ctx.wrapManager.getRumor(wrap.id)) return

    this.queue.push(wrap)
  }
}
