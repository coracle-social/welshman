import {Emitter, sleep} from "@welshman/lib"
import {Filter, TrustedEvent, matchFilters} from "@welshman/util"
import {Repository} from "./repository.js"

export class LocalRelay extends Emitter {
  subs = new Map<string, Filter[]>()

  constructor(readonly repository: Repository) {
    super()
  }

  send(type: string, ...message: any[]) {
    switch (type) {
      case "EVENT":
        return this.handleEVENT(message as [TrustedEvent])
      case "CLOSE":
        return this.handleCLOSE(message as [string])
      case "REQ":
        return this.handleREQ(message as [string, ...Filter[]])
    }
  }

  handleEVENT([event]: [TrustedEvent]) {
    this.repository.publish(event)

    // Callers generally expect async relays
    void sleep(1).then(() => {
      this.emit("OK", event.id, true, "")

      if (!this.repository.isDeleted(event)) {
        for (const [subId, filters] of this.subs.entries()) {
          if (matchFilters(filters, event)) {
            this.emit("EVENT", subId, event)
          }
        }
      }
    })
  }

  handleCLOSE([subId]: [string]) {
    this.subs.delete(subId)
  }

  handleREQ([subId, ...filters]: [string, ...Filter[]]) {
    this.subs.set(subId, filters)

    // Callers generally expect async relays
    void sleep(1).then(() => {
      for (const event of this.repository.query(filters)) {
        this.emit("EVENT", subId, event)
      }

      this.emit("EOSE", subId)
    })
  }
}
