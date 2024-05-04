import {Emitter} from '@welshman/lib'
import {matchFilters} from './Filters'
import type {Repository} from './Repository'
import type {Filter} from './Filters'
import type {Rumor} from './Events'

export class Relay<E extends Rumor> extends Emitter {
  subs = new Map<string, Filter[]>()

  constructor(readonly repository: Repository<E>) {
    super()
  }

  send(type: string, ...message: any[]) {
    switch(type) {
      case 'EVENT': return this.handleEVENT(message as [string])
      case 'CLOSE': return this.handleCLOSE(message as [string])
      case 'REQ': return this.handleREQ(message as [string, ...Filter[]])
    }
  }

  handleEVENT([json]: [string]) {
    let event: E
    try {
      event = JSON.parse(json)
    } catch (e) {
      return
    }

    this.repository.publish(event)

    this.emit('OK', event.id, true, "")

    if (!this.repository.isDeleted(event)) {
      const json = JSON.stringify(event)

      for (const [subId, filters] of this.subs.entries()) {
        if (matchFilters(filters, event)) {
          this.emit('EVENT', subId, json)
        }
      }
    }
  }

  handleCLOSE([subId]: [string]) {
    this.subs.delete(subId)
  }

  handleREQ([subId, ...filters]: [string, ...Filter[]]) {
    this.subs.set(subId, filters)

    for (const event of this.repository.query(filters)) {
      this.emit('EVENT', subId, JSON.stringify(event))
    }

    this.emit('EOSE', subId)
  }
}
