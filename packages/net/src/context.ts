import {verifyEvent, TrustedEvent} from "@welshman/util"
import {AbstractAdapter} from "./adapter.js"
import {Repository} from "./repository.js"
import {Pool} from "./pool.js"

export type AdapterFactory = (url: string, context: NetContext) => AbstractAdapter

export type NetContext = {
  isEventValid: (event: TrustedEvent, url: string) => boolean
  isEventDeleted: (event: TrustedEvent, url: string) => boolean
  pool?: Pool
  repository?: Repository
  getAdapter?: AdapterFactory
}

export const netContext: NetContext = {
  isEventValid: (event, url) => verifyEvent(event),
  isEventDeleted: (event, url) => netContext.repository?.isDeleted(event) ?? false,
}
