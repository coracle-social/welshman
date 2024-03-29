import {throttle} from 'throttle-debounce'
import {bech32, utf8} from "@scure/base"

export const now = () => Math.round(Date.now() / 1000)

export const nth = (i: number) => <T>(xs: T[]) => xs[i]

export const first = <T>(xs: T[], ...args: unknown[]) => xs[0]

export const last = <T>(xs: T[], ...args: unknown[]) => xs[xs.length - 1]

export const prop = (k: string) => <T>(x: Record<string, T>) => x[k]

export const identity = <T>(x: T) => x

export const max = (xs: number[]) => xs.reduce((a, b) => Math.max(a, b), 0)

export const min = (xs: number[]) => xs.reduce((a, b) => Math.min(a, b), 0)

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

export const avg = (xs: number[]) => sum(xs) / xs.length

export const between = (low: number, high: number, n: number) => n > low && n < high

export const flatten = <T>(xs: T[]) => xs.flatMap(identity)

export const uniq = <T>(xs: T[]) => Array.from(new Set(xs))

export const choice = <T>(xs: T[]): T => xs[Math.floor(xs.length * Math.random())]

export const shuffle = <T>(xs: Iterable<T>): T[] => Array.from(xs).sort(() => Math.random() > 0.5 ? 1 : -1)

export const randomId = (): string => Math.random().toString().slice(2)

export const isIterable = (x: any) => Symbol.iterator in Object(x)

export const toIterable = (x: any) => isIterable(x) ? x : [x]

export const stripProtocol = (url: string) => url.replace(/.*:\/\//, "")

export const ensurePlural = <T>(x: T | T[]) => (x instanceof Array ? x : [x])

export const groupBy = <T>(f: (x: T) => string, xs: T[]) => {
  const r: Record<string, T[]> = {}

  for (const x of xs) {
    const k = f(x)

    if (!r[k]) {
      r[k] = []
    }

    r[k].push(x)
  }

  return r
}

export const pushToKey = <T>(m: Record<string, T[]> | Map<string, T[]>, k: string, v: T) => {
  if (m instanceof Map) {
    const a = m.get(k) || []

    a.push(v)
    m.set(k, a)
  } else {
    m[k] = m[k] || []
    m[k].push(v)
  }

  return m
}

export const sample = <T>(n: number, xs: T[]) => {
  const result: T[] = []

  for (let i = 0; i < n; i++) {
    result.push(xs.splice(Math.floor(xs.length * Math.random()), 1)[0])
  }

  return result
}

export const initArray = <T>(n: number, f: () => T) => {
  const result = []

  for (let i = 0; i < n; i++) {
    result.push(f())
  }

  return result
}

export const chunk = <T>(chunkLength: number, coll: T[]) => {
  const result: T[][] = []
  const current: T[] = []

  for (const item of coll) {
    if (current.length < chunkLength) {
      current.push(item)
    } else {
      result.push(current.splice(0))
    }
  }

  if (current.length > 0) {
    result.push(current)
  }

  return result
}

export const chunks = <T>(n: number, coll: T[]) => {
  const result: T[][] = initArray(n, () => [])

  for (let i = 0; i < coll.length; i++) {
    result[i % n].push(coll[i])
  }

  return result
}

export const batch = <T>(t: number, f: (xs: T[]) => void) => {
  const xs: T[] = []
  const cb = throttle(t, () => xs.length > 0 && f(xs.splice(0)))

  return (x: T) => {
    xs.push(x)
    cb()
  }
}

export const hexToBech32 = (prefix: string, url: string) =>
  bech32.encode(prefix, bech32.toWords(utf8.decode(url)), false)

export const bech32ToHex = (b32: string) =>
  utf8.encode(bech32.fromWords(bech32.decode(b32, false).words))

// https://github.com/microsoft/TypeScript/issues/4628#issuecomment-1147905253
export type OmitStatics<T, S extends string> =
    T extends {new(...args: infer A): infer R} ?
        {new(...args: A): R}&Omit<T, S> :
        Omit<T, S>;

// https://github.com/microsoft/TypeScript/issues/4628#issuecomment-1147905253
export type OmitAllStatics<T extends {new(...args: any[]): any, prototype: any}> =
    T extends {new(...args: infer A): infer R, prototype: infer P} ?
        {new(...args: A): R, prototype: P} :
        never;
