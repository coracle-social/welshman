import type {NetContext} from './Context'


declare module "@welshman/lib" {
  interface Context {
    net: NetContext
  }
}
