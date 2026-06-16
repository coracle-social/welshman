import {AbstractAdapter} from "./adapter.js"
import {Repository} from "./repository.js"
import {Pool} from "./pool.js"

export type AdapterFactory = (url: string, context: NetContext) => AbstractAdapter

export type NetContext = {
  pool?: Pool
  repository?: Repository
  getAdapter?: AdapterFactory
}
