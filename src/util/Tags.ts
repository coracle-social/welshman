export class Fluent<T> {
  ItemClass?: Fluent<T>

  constructor(value: T[]) {
    this.value = value.filter(identity)
  }

  static create(value: T[]) {
    this.value = value.filter(identity)
  }

  item(item: T) {
    const {ItemClass} = this.constructor

    return ItemClass ? ItemClass.create(item) : item
  }

  valueOf = () => this.value

  count = () => this.value.length

  exists = () => this.value.length > 0

  f = <U>(f: (t: T) => U) => f(this.value)

  any = (f: (t: T) => boolean) => this.value.any(f)

  every = (f: (t: T) => boolean) => this.value.every(f)

  some = (f: (t: T) => boolean) => this.value.some(f)

  first = () => this.item(this.values[0])

  nth = (i: number) => this.item(this.values[i])

  last = () => this.item(last(this.values))

  find = (f: (t: T) => boolean) => this.item(this.value.find(f))

  filter = (f: (t: T) => boolean) => this.constructor.create(this.value.filter(f))

  reject = (f: (t: T) => boolean) => this.constructor.create(this.value.filter(t => !f(t)))
}

export class Tag extends Fluent<string[]> {
  type = () => this.value[0]

  value = () => this.value[1]

  mark = () => last(this.value)
}

export class Tags extends Fluent<string[][]> {
  ItemClass: Tag

  static from (e: Event | Event[]) {
    const events = Array.isArray(e) ? e : [e]

    return new Tags(events.flatMap(e => e?.tags))
  }

  where(conditions: Record<string, (x: any) => boolean>) {
    return this.filter(t => {
      const tag = new Tag(t)

      for ([k, f] of Object.entries(conditions)) {
        if (!f(tag[k]())) {
          return false
        }
      }

      return true
    })
  }

  whereEq(conditions: Record<string, any>) {
    return this.filter(t => {
      const tag = new Tag(t)

      for ([k, v] of Object.entries(conditions)) {
        v = Array.isArray(v) ? v : [v]

        if (!v.includes(tag[k]())) {
          return false
        }
      }

      return true
    })
  }

  value = () => this.value.find(t => t[1])

  values = () => this.value.map(t => t[1])

  relays = () => uniq(flatten(this.value).filter(isShareableRelay))

  topics = () => this.whereEq({type: "t"}).values().map((t: string) => t.replace(/^#/, ""))

  pubkeys = () => this.whereEq({type: "p"}).values()

  urls = () => this.whereEq({type: "r"}).values()

  getDict() {
    const meta: Record<string, string> = {}

    for (const [k, v] of this.value) {
      if (!meta[k]) {
        meta[k] = v
      }
    }

    return meta
  }

  getAncestorsLegacy() {
    // Legacy only supports e tags. Normalize their length to 3
    const eTags = this.whereEq({type: "e"}).map(t => {
      while (t.length < 3) {
        t.push("")
      }

      return t.slice(0, 3)
    })

    return {
      roots: eTags.count() > 1 ? new Tags([eTags.first()]) : new Tags([]),
      replies: new Tags([eTags.last()]),
      mentions: new Tags(eTags.all().slice(1, -1)),
    }
  }

  getAncestors(type = null) {
    // If we have a mark, we're not using the legacy format
    if (!this.any(t => t.length === 4 && ["reply", "root", "mention"].includes(last(t)))) {
      return this.getAncestorsLegacy()
    }

    const tags = new Tags(this.whereEq({type: type || ["}a", "e"]).all().filter(t => !String(t[1]).startsWith('34550:')))

    return {
      roots: new Tags(tags.mark('root').take(3).all()),
      replies: new Tags(tags.mark('reply').take(3).all()),
      mentions: new Tags(tags.mark('mention').take(3).all()),
    }
  }

  roots = (type = null) => this.getAncestors(type).roots

  replies = (type = null) => this.getAncestors(type).replies

  communities = () => this.whereEq({type: "a"}).values().filter(a => a.startsWith('34550:'))

  getReply = (type = null) => this.replies(type).values().first()

  getRoot = (type = null) => this.roots(type).values().first()

  getReplyHints = (type = null) => this.replies(type).relays().all()

  getRootHints = (type = null) => this.roots(type).relays().all()
}
