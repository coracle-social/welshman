import {verifyEvent, TrustedEvent} from "@welshman/util"
import {AbstractAdapter} from "./adapter.js"
import {Repository} from "./repository.js"
import {Pool} from "./pool.js"

export type NetContext = {
  pool: Pool
  repository: Repository
  isEventValid: (event: TrustedEvent, url: string) => boolean
  isEventDeleted: (event: TrustedEvent, url: string) => boolean
  getAdapter?: (url: string, context: NetContext) => AbstractAdapter
}

export const netContext: NetContext = {
  pool: Pool.get(),
  repository: Repository.get(),
  isEventValid: (event, url) => verifyEvent(event),
  isEventDeleted: (event, url) => netContext.repository.isDeleted(event),
}
