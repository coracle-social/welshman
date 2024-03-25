import {last} from './Tools'

export class Fluent<T> {
  constructor(readonly xs: T[]) {}

  static create() {
    return this.from([])
  }

  static from<T>(xs: Iterable<T>) {
    return new Fluent<T>(Array.from(xs))
  }

  clone<K extends Fluent<T>>(this: K, xs: T[]): K {
    return new (this.constructor as { new (xs: T[]): K })(xs)
  }

  valueOf = () => this.xs

  first = () => this.xs[0]

  nth = (i: number) => this.xs[i]

  last = () => last(this.xs)

  count = () => this.xs.length

  exists = () => this.xs.length > 0

  has = (v: T) => this.xs.includes(v)

  every = (f: (t: T) => boolean) => this.xs.every(f)

  some = (f: (t: T) => boolean) => this.xs.some(f)

  find = (f: (t: T) => boolean) => this.xs.find(f)

  uniq = () => this.clone(Array.from(new Set(this.xs)))

  slice = (a: number, b?: number) => this.clone(this.xs.slice(a, b))

  take = (n: number) => this.slice(0, n)

  drop = (n: number) => this.slice(n)

  filter = (f: (t: T) => boolean) => this.clone(this.xs.filter(f))

  reject = (f: (t: T) => boolean) => this.clone(this.xs.filter(t => !f(t)))

  map = (f: (t: T) => T) => this.clone(this.xs.map(f))

  mapTo = <U>(f: (t: T) => U) => Fluent.from(this.xs.map(f))

  flatMap = <U>(f: (t: T) => U[]) => Fluent.from(this.xs.flatMap(f))

  forEach = (f: (t: T, i: number) => void) => this.xs.forEach(f)

  set = (i: number, x: T) => this.clone([...this.xs.slice(0, i), x, ...this.xs.slice(i + 1)])

  concat = (xs: T[]) => this.clone(this.xs.concat(xs))

  append = (x: T) => this.concat([x])

  prepend = (x: T) => this.clone([x].concat(this.xs))
}
