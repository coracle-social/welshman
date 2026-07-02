import {
  getEventsById,
  deriveEventsById,
  deriveEvents,
  makeDeriveEvent,
  getEventsByIdByUrl,
  deriveEventsByIdByUrl,
  getEventsByIdForUrl,
  deriveEventsByIdForUrl,
  deriveItemsByKey,
  deriveItemsByKeyByUrl,
  deriveIsDeleted,
} from "@welshman/store"
import type {
  EventsByIdOptions,
  EventOptions,
  EventsByIdByUrlOptions,
  EventsByIdForUrlOptions,
  ItemsByKeyOptions,
  ItemsByKeyByUrlOptions,
} from "@welshman/store"
import type {TrustedEvent} from "@welshman/util"
import type {IApp} from "../app.js"

/**
 * Store/derivation utilities bound to the app's repository and tracker. Reach
 * it via `app.use(Stores)`.
 */
export class Stores {
  constructor(readonly app: IApp) {}

  getEventsById = (options: Omit<EventsByIdOptions, "repository">) =>
    getEventsById({...options, repository: this.app.repository})

  eventsById = (options: Omit<EventsByIdOptions, "repository">) =>
    deriveEventsById({...options, repository: this.app.repository})

  events = (options: Omit<EventsByIdOptions, "repository">) =>
    deriveEvents({...options, repository: this.app.repository})

  makeEvent = (options: Omit<EventOptions, "repository">) =>
    makeDeriveEvent({...options, repository: this.app.repository})

  itemsByKeyByUrl = <T>(options: Omit<ItemsByKeyByUrlOptions<T>, "tracker" | "repository">) =>
    deriveItemsByKeyByUrl<T>({
      ...options,
      tracker: this.app.tracker,
      repository: this.app.repository,
    })

  getEventsByIdByUrl = (options: Omit<EventsByIdByUrlOptions, "tracker" | "repository">) =>
    getEventsByIdByUrl({...options, tracker: this.app.tracker, repository: this.app.repository})

  eventsByIdByUrl = (options: Omit<EventsByIdByUrlOptions, "tracker" | "repository">) =>
    deriveEventsByIdByUrl({...options, tracker: this.app.tracker, repository: this.app.repository})

  getEventsByIdForUrl = (options: Omit<EventsByIdForUrlOptions, "tracker" | "repository">) =>
    getEventsByIdForUrl({...options, tracker: this.app.tracker, repository: this.app.repository})

  eventsByIdForUrl = (options: Omit<EventsByIdForUrlOptions, "tracker" | "repository">) =>
    deriveEventsByIdForUrl({...options, tracker: this.app.tracker, repository: this.app.repository})

  itemsByKey = <T>(options: Omit<ItemsByKeyOptions<T>, "repository">) =>
    deriveItemsByKey<T>({...options, repository: this.app.repository})

  isDeleted = (event: TrustedEvent) => deriveIsDeleted(this.app.repository, event)
}
