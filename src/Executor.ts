import type {EventBus} from './util/EventBus.ts'

const createFilterId = filters =>
  [Math.random().toString().slice(2, 6), filters.map(describeFilter).join(":")].join("-")

const describeFilter = ({kinds = [], ...filter}) => {
  const parts = []

  parts.push(kinds.join(","))

  for (const [key, value] of Object.entries(filter)) {
    if (value instanceof Array) {
      parts.push(`${key}[${value.length}]`)
    } else {
      parts.push(key)
    }
  }

  return "(" + parts.join(",") + ")"
}

type Executable = {
  bus: EventBus
  send: (verb: string, ...args) => void
}

export class Executor {
  target: Executable
  constructor(target) {
    this.target = target
  }
  subscribe(filters, {onEvent, onEose}) {
    const id = createFilterId(filters)
    const unsubscribe = this.target.bus.addListeners({
      EVENT: (url, subid, e) => subid === id && onEvent?.(url, e),
      EOSE: (url, subid) => subid === id && onEose?.(url),
    })

    this.target.send("REQ", id, ...filters)

    return {
      unsubscribe: () => {
        this.target.send("CLOSE", id)

        unsubscribe()
      },
    }
  }
  publish(event, {onOk, onError}) {
    const unsubscribe = this.target.bus.addListeners({
      OK: (url, id, ...payload) => id === event.id && onOk(url, id, ...payload),
      ERROR: (url, id, ...payload) => id === event.id && onError(url, id, ...payload),
    })

    this.target.send("EVENT", event)

    return {unsubscribe}
  }
  count(filters, {onCount}) {
    const id = createFilterId(filters)
    const unsubscribe = this.target.bus.addListeners({
      COUNT: (url, subid, ...payload) => {
        if (subid === id) {
          onCount(url, ...payload)
          unsubscribe()
        }
      }
    })

    this.target.send("COUNT", id, ...filters)

    return {unsubscribe}
  }
  handleAuth({onAuth, onOk}) {
    let event

    const unsubscribe = this.target.bus.addListeners({
      AUTH: async (url, challenge) => {
        event = await onAuth(url, challenge)
      },
      OK: (url, id, ok, message) => {
        if (id === event?.id) {
          event = null
          onOk(url, id, ok, message)
        }
      }
    })

    return {unsubscribe}
  }
}
