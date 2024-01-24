import {last} from './misc'

export class Fluent<T> {
  constructor(readonly parts: T[]) {}

  static from<T>(parts: Iterable<T>) {
    return new Fluent<T>(Array.from(parts))
  }

  clone<K extends Fluent<T>>(this: K, parts: T[]): K {
    return new (this.constructor as { new (parts: T[]): K })(parts)
  }

  *[Symbol.iterator]() {
    for (const x of this.parts) {
      yield x
    }
  }

  first = () => Array.from(this.parts)[0]

  nth = (i: number) => Array.from(this.parts)[i]

  last = () => last(Array.from(this.parts))

  count = () => Array.from(this.parts).length

  exists = () => Array.from(this.parts).length > 0

  every = (f: (t: T) => boolean) => Array.from(this.parts).every(f)

  some = (f: (t: T) => boolean) => Array.from(this.parts).some(f)

  find = (f: (t: T) => boolean) => Array.from(this.parts).find(f)

  uniq = () => this.clone(Array.from(new Set(this.parts)))

  slice = (a: number, b?: number) => this.clone(Array.from(this.parts).slice(a, b))

  take = (n: number) => this.slice(0, n)

  drop = (n: number) => this.slice(n)

  filter = (f: (t: T) => boolean) => this.clone(Array.from(this.parts).filter(f))

  reject = (f: (t: T) => boolean) => this.clone(Array.from(this.parts).filter(t => !f(t)))

  map = <U>(f: (t: T) => U) => new Fluent(Array.from(this.parts).map(f))
}
