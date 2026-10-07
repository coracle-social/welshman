import {filter, spec} from "@welshman/lib"
import type {Maybe} from "@welshman/lib"
import type {Filter, TrustedEvent} from "@welshman/util"
import {
  deriveArray,
  deriveEvents,
  deriveEventsAsc,
  deriveEventsByIdByUrl,
  deriveEventsByIdForUrl,
  deriveEventsById,
  deriveEventsDesc,
  deriveIsDeleted,
  makeDeriveEvent,
  projection,
} from "@welshman/store"
import type {EventsById, EventsByIdByUrl, Projection} from "@welshman/store"
import type {Relay} from "@welshman/domain"
import {derived} from "svelte/store"
import {Network} from "./network.js"
import {Relays} from "./relays.js"
import type {IApp} from "../app.js"

/**
 * Reactive views over the app's repository. Every method binds this app's
 * repository and tracker and hands back a `Projection` — read it synchronously
 * with `.get()`, or subscribe to `.$` — so callers never build one from the
 * other, and never construct `{repository, tracker}` by hand.
 *
 * Each view reads through a direct repository/tracker query rather than through
 * its derived store. Those queries are index-backed; standing a derived store up
 * and tearing it down just to read a value is not. `@welshman/store` pairs the
 * two, so a view over a single store passes neither half.
 */
export class Events {
  constructor(readonly app: IApp) {}

  byId = (filters: Filter[] = [{}]): Projection<EventsById> =>
    deriveEventsById({repository: this.app.repository, filters})

  all = (filters: Filter[] = [{}]): Projection<TrustedEvent[]> =>
    deriveEvents({repository: this.app.repository, filters})

  asc = (filters: Filter[] = [{}]): Projection<TrustedEvent[]> =>
    deriveEventsAsc(this.byId(filters))

  desc = (filters: Filter[] = [{}]): Projection<TrustedEvent[]> =>
    deriveEventsDesc(this.byId(filters))

  one = (idOrAddress: string, relays: string[] = []): Projection<Maybe<TrustedEvent>> =>
    makeDeriveEvent({
      repository: this.app.repository,
      includeDeleted: true,
      onDerive: (filters: Filter[], hints: string[]) =>
        this.app.use(Network).loadLenient({filters, relays: hints}),
    })(idOrAddress, relays)

  isDeleted = (event: TrustedEvent): Projection<boolean> =>
    deriveIsDeleted(this.app.repository, event)

  // Scoped to one relay, via the tracker

  byIdForUrl = (url: string, filters: Filter[] = [{}]): Projection<EventsById> =>
    deriveEventsByIdForUrl({
      url,
      filters,
      tracker: this.app.tracker,
      repository: this.app.repository,
    })

  forUrl = (url: string, filters: Filter[] = [{}]): Projection<TrustedEvent[]> =>
    deriveArray(this.byIdForUrl(url, filters))

  byIdByUrl = (filters: Filter[] = [{}]): Projection<EventsByIdByUrl> =>
    deriveEventsByIdByUrl({
      filters,
      tracker: this.app.tracker,
      repository: this.app.repository,
    })

  relaySignedForUrl = (url: string, filters: Filter[] = [{}]): Projection<TrustedEvent[]> => {
    const forUrl = this.forUrl(url, filters)

    return projection(
      derived(
        [this.app.use(Relays).one(url), forUrl.$],
        ([$relay, $events]: [Maybe<Relay>, TrustedEvent[]]) =>
          filter(spec({pubkey: $relay?.self}), $events),
      ),
      () => filter(spec({pubkey: this.app.use(Relays).get(url)?.self}), forUrl.get()),
    )
  }
}
