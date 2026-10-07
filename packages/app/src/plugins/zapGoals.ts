import {derived} from "svelte/store"
import type {Readable} from "svelte/store"
import {ZAP_RECEIPT} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {ZapGoal} from "@welshman/domain"
import type {ZapGoalProgress} from "@welshman/domain"
import {projection} from "@welshman/store"
import type {Projection} from "@welshman/store"
import {Domain} from "./domain.js"
import {Events} from "./events.js"
import {Zappers} from "./zappers.js"
import type {IApp} from "../app.js"

/**
 * NIP-75 zap goals (kind 9041). How much a goal has raised takes three steps —
 * every receipt for it out of the repository, each one validated against its
 * recipient's zapper, and the ones that arrived after the goal closed dropped —
 * and the receipts and the zappers arrive separately, so `progress` wires the
 * whole chain up and hands back a single projection.
 */
export class ZapGoals {
  constructor(readonly app: IApp) {}

  progress = (event: TrustedEvent, relays: string[] = []): Projection<ZapGoalProgress> => {
    const goal = this.app.use(Domain).reader(ZapGoal)(event)
    const zappers = this.app.use(Zappers)
    const receipts = this.app.use(Events).all([{kinds: [ZAP_RECEIPT], "#e": [event.id]}])
    const validated = ($receipts: TrustedEvent[]) =>
      zappers.validZapReceipts($receipts, event, relays)

    return projection(
      derived<Readable<TrustedEvent[]>, ZapGoalProgress>(
        receipts.$,
        ($receipts, set) => validated($receipts).$.subscribe(zaps => set(goal.progress(zaps))),
        goal.progress([]),
      ),
      () => goal.progress(validated(receipts.get()).get()),
    )
  }
}
