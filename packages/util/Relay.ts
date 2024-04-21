import {Emitter, uniq, omit, now, range, identity, pushToMapKey} from '@coracle.social/lib'
import {matchFilters, matchFilter} from './Filters'
import {encodeAddress, addressFromEvent} from './Address'
import {isReplaceable} from './Events'
import type {Filter} from './Filters'
import type {Rumor} from './Events'

export const DAY = 86400

const getDay = (ts: number) => Math.floor(ts / DAY)

export type Message = [string, ...any[]]

export class Relay<E extends Rumor> extends Emitter {
  eventsById = new Map<string, E>()
  eventsByAddress = new Map<string, E>()
  eventsByTag = new Map<string, E[]>()
  eventsByDay = new Map<number, E[]>()
  eventsByAuthor = new Map<string, E[]>()
  subs = new Map<string, Filter[]>()
  deletes = new Map<string, number>()

  dump() {
    return Array.from(this.eventsById.values())
  }

  load(events: E[]) {
    for (const event of events) {
      this._addEvent(event)
    }
  }

  send(type: string, ...message: any[]) {
    switch(type) {
      case 'EVENT': return this._onEVENT(message as [string])
      case 'CLOSE': return this._onCLOSE(message as [string])
      case 'REQ': return this._onREQ(message as [string, ...Filter[]])
    }
  }

  _onEVENT([json]: [string]) {
    let event: E
    try {
      event = JSON.parse(json)
    } catch (e) {
      return
    }

    const duplicateById = this.eventsById.get(event.id)

    if (duplicateById) {
      return
    }

    const hasAddress = isReplaceable(event)
    const address = encodeAddress(addressFromEvent(event))
    const duplicateByAddress = hasAddress ? this.eventsByAddress.get(address) : undefined

    if (duplicateByAddress && duplicateByAddress.created_at >= event.created_at) {
      return
    }

    this._addEvent(event, duplicateByAddress)

    this.emit('OK', event.id, true, "")

    if (!this._isDeleted(event)) {
      for (const [subId, filters] of this.subs.entries()) {
        if (matchFilters(filters, event)) {
          this.emit('EVENT', subId, json)
        }
      }
    }
  }

  _onCLOSE([subId]: [string]) {
    this.subs.delete(subId)
  }

  _onREQ([subId, ...filters]: [string, ...Filter[]]) {
    this.subs.set(subId, filters)

    const result = new Set()

    for (let filter of filters) {
      let events: Iterable<E> = this.eventsById.values()

      if (filter.ids) {
        filter = omit(['ids'], filter)
        events = filter.ids!.map(id => this.eventsById.get(id)).filter(identity) as E[]
      } else if (filter.authors) {
        filter = omit(['authors'], filter)
        events = uniq(filter.authors!.flatMap(pubkey => this.eventsByAuthor.get(pubkey) || []))
      } else if (filter.since || filter.until) {
        const sinceDay = getDay(filter.since || 0)
        const untilDay = getDay(filter.since || now())

        filter = omit(['since', 'until'], filter)
        events = uniq(
          Array.from(range(sinceDay, untilDay))
            .flatMap((day: number) => this.eventsByDay.get(day) || [])
        )
      } else {
        for (const [k, values] of Object.entries(filter)) {
          if (!k.startsWith('#') || k.length !== 2) {
            continue
          }

          filter = omit([k], filter)
          events = uniq(
            (values as string[]).flatMap(v => this.eventsByTag.get(`${k[1]}:${v}`) || [])
          )

          break
        }
      }

      for (const event of events) {
        if (!this._isDeleted(event) && matchFilter(filter, event)) {
          result.add(event)
        }
      }
    }

    for (const event of result) {
      this.emit('EVENT', subId, JSON.stringify(event))
    }

    this.emit('EOSE', subId)
  }

  _isDeleted(event: E) {
    const idDeletedAt = this.deletes.get(event.id) || 0

    if (idDeletedAt > event.created_at) {
      return true
    }

    if (isReplaceable(event)) {
      const address = encodeAddress(addressFromEvent(event))
      const addressDeletedAt = this.deletes.get(address) || 0

      if (addressDeletedAt > event.created_at) {
        return true
      }
    }

    return false
  }

  _addEvent(event: E, duplicate?: E) {
    this.eventsById.set(event.id, event)

    if (isReplaceable(event)) {
      this.eventsByAddress.set(encodeAddress(addressFromEvent(event)), event)
    }

    this._updateIndex(this.eventsByDay, getDay(event.created_at), event, duplicate)
    this._updateIndex(this.eventsByAuthor, event.pubkey, event, duplicate)

    for (const tag of event.tags) {
      if (tag[0].length === 1) {
        this._updateIndex(this.eventsByTag, tag.slice(0, 2).join(':'), event, duplicate)

        if (event.kind === 5) {
          this.deletes.set(tag[1], Math.max(event.created_at, this.deletes.get(tag[1]) || 0))
        }
      }
    }
  }

  _updateIndex<K>(m: Map<K, E[]>, k: K, e: E, duplicate?: E) {
    let a = m.get(k) || []

    if (duplicate) {
      a = a.filter((x: E) => x !== duplicate)
    }

    a.push(e)
    m.set(k, a)
  }
}
