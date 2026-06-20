import {writable} from "svelte/store"
import {randomId} from "@welshman/lib"
import {projection} from "./base.js"
import type {IApp} from "../app.js"

export type LogMessage = {
  source: string
  id: string
  at: number
  [key: string]: unknown
}

/**
 * A logger which stores messages durably for inspection. Subscribe to `messages`
 * (a projection) to read the log; append with `log(source, {...})`.
 */
export class Logger {
  protected store = writable<LogMessage[]>([])
  messages = projection(this.store)

  constructor(protected readonly app: IApp) {}

  log(
    source: string,
    {id = randomId(), at = Date.now(), ...message}: {id?: string; at?: number; [key: string]: unknown},
  ) {
    this.store.update($messages => $messages.concat({source, id, at, ...message}).slice(-1000))
  }
}
