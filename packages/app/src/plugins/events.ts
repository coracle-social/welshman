import {filter, spec} from "@welshman/lib"
import type {Maybe} from "@welshman/lib"
import {sortEventsAsc, sortEventsDesc} from "@welshman/util"
import type {Filter, TrustedEvent} from "@welshman/util"
import {
  deriveArray,
  deriveEventsAsc,
  deriveEventsByIdByUrl,
  deriveEventsByIdForUrl,
  deriveEventsById,
  deriveEventsDesc,
  deriveIsDeleted,
  getEventsByIdByUrl,
  getEventsByIdForUrl,
  getEventsById,
  makeDeriveEvent,
} from "@welshman/store"
import type {EventsById, EventsByIdByUrl} from "@welshman/store"
import type {Relay} from "@welshman/domain"
import {derived} from "svelte/store"
import {projection} from "./base.js"
import type {Projection} from "./base.js"
import {Network} from "./network.js"
import {Relays} from "./relays.js"
import type {IApp} from "../app.js"

/**
 * Reactive views over the app's repository. Every method binds this app's
 * repository and tracker and hands back a `Projection` — read it synchronously
 * with `.get()`, or subscribe to `.$` — so callers never build one from the
 * other, and never construct `{repository, tracker}` by hand.
 *
 * Each projection supplies its own getter that queries the repository/tracker
 * directly, rather than falling back to reading through the derived store. Those
 * queries are index-backed; standing a derived store up and tearing it down just
 * to read a value is not.
 */
export class Events {
  constructor(readonly app: IApp) {}

  byId = (filters: Filter[] = [{}]): Projection<EventsById> => {
    const options = {repository: this.app.repository, filters}

    return projection(deriveEventsById(options), () => getEventsById(options))
  }

  all = (filters: Filter[] = [{}]): Projection<TrustedEvent[]> => {
    const options = {repository: this.app.repository, filters}

    return projection(deriveArray(deriveEventsById(options)), () =>
      Array.from(getEventsById(options).values()),
    )
  }

  asc = (filters: Filter[] = [{}]): Projection<TrustedEvent[]> => {
    const options = {repository: this.app.repository, filters}

    return projection(deriveEventsAsc(deriveEventsById(options)), () =>
      sortEventsAsc(getEventsById(options).values()),
    )
  }

  desc = (filters: Filter[] = [{}]): Projection<TrustedEvent[]> => {
    const options = {repository: this.app.repository, filters}

    return projection(deriveEventsDesc(deriveEventsById(options)), () =>
      sortEventsDesc(getEventsById(options).values()),
    )
  }

  one = (idOrAddress: string, relays: string[] = []): Projection<Maybe<TrustedEvent>> =>
    projection(
      makeDeriveEvent({
        repository: this.app.repository,
        includeDeleted: true,
        onDerive: (filters: Filter[], hints: string[]) =>
          this.app.use(Network).load({filters, relays: hints}),
      })(idOrAddress, relays),
      () => this.app.repository.getEvent(idOrAddress),
    )

  isDeleted = (event: TrustedEvent): Projection<boolean> =>
    projection(deriveIsDeleted(this.app.repository, event), () =>
      this.app.repository.isDeleted(event),
    )

  // Scoped to one relay, via the tracker

  byIdForUrl = (url: string, filters: Filter[] = [{}]): Projection<EventsById> => {
    const options = {url, filters, tracker: this.app.tracker, repository: this.app.repository}

    return projection(deriveEventsByIdForUrl(options), () => getEventsByIdForUrl(options))
  }

  forUrl = (url: string, filters: Filter[] = [{}]): Projection<TrustedEvent[]> => {
    const options = {url, filters, tracker: this.app.tracker, repository: this.app.repository}

    return projection(deriveArray(deriveEventsByIdForUrl(options)), () =>
      Array.from(getEventsByIdForUrl(options).values()),
    )
  }

  byIdByUrl = (filters: Filter[] = [{}]): Projection<EventsByIdByUrl> => {
    const options = {filters, tracker: this.app.tracker, repository: this.app.repository}

    return projection(deriveEventsByIdByUrl(options), () => getEventsByIdByUrl(options))
  }

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
