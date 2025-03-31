import TypedEventEmitter, {EventMap} from "typed-emitter"

export type TypedEmitter<T extends EventMap> = TypedEventEmitter.default<T>

export type Unsubscriber = () => void
