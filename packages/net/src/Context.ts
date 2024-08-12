import type {Event} from 'nostr-tools/pure'
import {matchFilters, hasValidSignature} from '@welshman/util'
import type {Filter} from '@welshman/util'
import {Pool} from "./Pool"
import {Executor} from "./Executor"
import {Relays} from "./target/Relays"

export const defaultPool = new Pool()

export const defaultGetExecutor = (relays: string[]) =>
  new Executor(new Relays(relays.map((relay: string) => NetworkContext.pool.get(relay))))

const defaultOnEvent = (url: string, event: Event) => null

const defaultOnAuth = (url: string, challenge: string) => null

const defaultOnOk = (url: string, id: string, ok: boolean, message: string) => null

const defaultIsDeleted = (url: string, event: Event) => false

const defaultHasValidSignature = (url: string, event: Event) => hasValidSignature(event)

const defaultMatchFilters = (url: string, filters: Filter[], event: Event) => matchFilters(filters, event)

export const NetworkContext = {
  pool: defaultPool,
  getExecutor: defaultGetExecutor,
  onEvent: defaultOnEvent,
  onAuth: defaultOnAuth,
  onOk: defaultOnOk,
  isDeleted: defaultIsDeleted,
  hasValidSignature: defaultHasValidSignature,
  matchFilters: defaultMatchFilters,
}
