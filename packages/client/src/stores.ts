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
  deriveIsDeleted,
} from "@welshman/store"
import type {
  EventsByIdOptions,
  EventOptions,
  EventsByIdByUrlOptions,
  EventsByIdForUrlOptions,
  ItemsByKeyOptions,
} from "@welshman/store"
import type {TrustedEvent} from "@welshman/util"
import type {IClient} from "./client.js"

/**
 * Store/derivation utilities bound to the client's repository and tracker. Reach
 * it via `client.use(Stores)`.
 */
export class Stores {
  constructor(readonly ctx: IClient) {}

  getEventsById = (options: Omit<EventsByIdOptions, "repository">) =>
    getEventsById({...options, repository: this.ctx.repository})

  deriveEventsById = (options: Omit<EventsByIdOptions, "repository">) =>
    deriveEventsById({...options, repository: this.ctx.repository})

  deriveEvents = (options: Omit<EventsByIdOptions, "repository">) =>
    deriveEvents({...options, repository: this.ctx.repository})

  makeDeriveEvent = (options: Omit<EventOptions, "repository">) =>
    makeDeriveEvent({...options, repository: this.ctx.repository})

  getEventsByIdByUrl = (options: Omit<EventsByIdByUrlOptions, "tracker" | "repository">) =>
    getEventsByIdByUrl({...options, tracker: this.ctx.tracker, repository: this.ctx.repository})

  deriveEventsByIdByUrl = (options: Omit<EventsByIdByUrlOptions, "tracker" | "repository">) =>
    deriveEventsByIdByUrl({...options, tracker: this.ctx.tracker, repository: this.ctx.repository})

  getEventsByIdForUrl = (options: Omit<EventsByIdForUrlOptions, "tracker" | "repository">) =>
    getEventsByIdForUrl({...options, tracker: this.ctx.tracker, repository: this.ctx.repository})

  deriveEventsByIdForUrl = (options: Omit<EventsByIdForUrlOptions, "tracker" | "repository">) =>
    deriveEventsByIdForUrl({...options, tracker: this.ctx.tracker, repository: this.ctx.repository})

  deriveItemsByKey = <T>(options: Omit<ItemsByKeyOptions<T>, "repository">) =>
    deriveItemsByKey<T>({...options, repository: this.ctx.repository})

  deriveIsDeleted = (event: TrustedEvent) => deriveIsDeleted(this.ctx.repository, event)
}
