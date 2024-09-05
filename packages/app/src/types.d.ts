import type {NetContext} from '@welshman/net'
import type {AppContext} from './context'

declare module "@welshman/lib" {
  interface Context {
    net: NetContext
    app: AppContext
  }
}
