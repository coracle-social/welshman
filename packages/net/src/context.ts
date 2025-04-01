import {Repository} from "@welshman/relay"
import {verifyEvent, TrustedEvent, SignedEvent} from "@welshman/util"
import {AbstractAdapter} from "./adapter.js"
import {Pool} from "./pool.js"

export type NetContext = {
  pool: Pool
  repository: Repository
  isEventValid: (event: TrustedEvent, url: string) => boolean
  isEventDeleted: (event: TrustedEvent, url: string) => boolean
  getAdapter?: (url: string, context: NetContext) => AbstractAdapter
}

export const netContext: NetContext = {
  pool: Pool.getSingleton(),
  repository: Repository.getSingleton(),
  isEventValid: (event, url) => Boolean(event.sig && verifyEvent(event as SignedEvent)),
  isEventDeleted: (event, url) => netContext.repository.isDeleted(event),
}
