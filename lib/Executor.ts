import type {EventBus} from './util/EventBus.ts'

type Executable = {
  bus: EventBus
  send: (verb: string, ...args) => void
}

export class Executor {
  target: Executable
  constructor(target) {
    this.target = target
  }
  subscribe(filters, id, {onEvent, onEose}) {
    const [eventChannel, eoseChannel] = [
      this.target.bus.on("EVENT", (subid, e) => subid === id && onEvent?.(e)),
      this.target.bus.on("EOSE", subid => subid === id && onEose?.()),
    ]

    this.target.send("REQ", id, ...filters)

    return {
      unsubscribe: () => {
        this.target.send("CLOSE", id)
        this.target.bus.off("EVENT", eventChannel)
        this.target.bus.off("EOSE", eoseChannel)
      },
    }
  }
  publish(event, {onOk, onError}) {
    const withCleanup = cb => (id, ...payload) => {
      if (id === event.id) {
        cb(id, ...payload)
        this.target.bus.off("OK", okChannel)
        this.target.bus.off("ERROR", errorChannel)
      }
    }

    const [okChannel, errorChannel] = [
      this.target.bus.on("OK", withCleanup(onOk)),
      this.target.bus.on("ERROR", withCleanup(onError)),
    ]

    this.target.send("EVENT", event)
  }
  count(filter, id, {onCount}) {
    const channel = this.target.bus.on("COUNT", (subid, ...payload) => {
      if (subid === id) {
        onCount(...payload)

        this.target.bus.off("COUNT", channel)
      }
    })

    this.target.send("COUNT", id, ...filter)
  }
}
