import {throttle} from 'throttle-debounce'
import {bech32, utf8} from "@scure/base"

// Data types

export type Nil = null | undefined

export const isNil = (x: any) => [null, undefined].includes(x)

// Regular old utils

export const now = () => Math.round(Date.now() / 1000)

export const first = <T>(xs: T[], ...args: unknown[]) => xs[0]

export const last = <T>(xs: T[], ...args: unknown[]) => xs[xs.length - 1]

export const identity = <T>(x: T, ...args: unknown[]) => x

export const always = <T>(x: T, ...args: unknown[]) => () => x

export const inc = (x: number | Nil) => (x || 0) + 1

export const dec = (x: number | Nil) => (x || 0) - 1

export const max = (xs: number[]) => xs.reduce((a, b) => Math.max(a, b), 0)

export const min = (xs: number[]) => xs.reduce((a, b) => Math.min(a, b), 0)

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

export const avg = (xs: number[]) => sum(xs) / xs.length

export const drop = <T>(n: number, xs: T[]) => xs.slice(n)

export const take = <T>(n: number, xs: T[]) => xs.slice(0, n)

export const omit = <T extends Record<string, any>>(ks: string[], x: T) => {
  const r: T = {...x}

  for (const k of ks) {
    delete r[k]
  }

  return r
}

export const pick = <T extends Record<string, any>>(ks: string[], x: T) => {
  const r: T = {...x}

  for (const k of Object.keys(x)) {
    if (!ks.includes(k)) {
      delete r[k]
    }
  }

  return r
}

export function* range(a: number, b: number, step = 1) {
  for (let i = a; i < b; i += step) {
    yield i
  }
}

export const between = (low: number, high: number, n: number) => n > low && n < high

export const randomId = (): string => Math.random().toString().slice(2)

export const stripProtocol = (url: string) => url.replace(/.*:\/\//, "")

export const sleep = (t: number) => new Promise(resolve => setTimeout(resolve, t))

export const concat = <T>(...xs: (T | Nil)[][]) => xs.flatMap(x => x || [])

export const append = <T>(xs: (T | Nil)[], x: T) => concat(xs, [x])

export const union = <T>(a: T[], b: T[]) => uniq([...a, ...b])

export const intersection = <T>(a: T[], b: T[]) => {
  const s = new Set(b)

  return a.filter(x => s.has(x))
}

export const difference = <T>(a: T[], b: T[]) => {
  const s = new Set(b)

  return a.filter(x => !s.has(x))
}

export const remove = <T>(a: T, b: T[]) => b.filter(x => x !== a)

export const clamp = ([min, max]: [number, number], n: number) => Math.min(max, Math.max(min, n))

export const tryCatch = async <T>(f: () => Promise<T | void> | T | void, onError?: (e: Error) => void): Promise<T | void> => {
  try {
    return await f()
  } catch (e) {
    onError?.(e as Error)
  }

  return undefined
}

// Curried utils

export const nth = (i: number) => <T>(xs: T[], ...args: unknown[]) => xs[i]

export const nthEq = (i: number, v: any) => (xs: any[], ...args: unknown[]) => xs[i] === v

export const eq = <T>(v: T) => (x: T) => x === v

export const ne = <T>(v: T) => (x: T) => x !== v

export const prop = (k: string) => <T>(x: Record<string, T>) => x[k]

export const hash = (s: string) =>
  Math.abs(s.split("").reduce((a, b) => ((a << 5) - a + b.charCodeAt(0)) | 0, 0)).toString()

// Collections

export const splitAt = <T>(n: number, xs: T[]) => [xs.slice(0, n), xs.slice(n)]

export const choice = <T>(xs: T[]): T => xs[Math.floor(xs.length * Math.random())]

export const shuffle = <T>(xs: Iterable<T>): T[] => Array.from(xs).sort(() => Math.random() > 0.5 ? 1 : -1)

export const isIterable = (x: any) => Symbol.iterator in Object(x)

export const toIterable = (x: any) => isIterable(x) ? x : [x]

export const ensurePlural = <T>(x: T | T[]) => (x instanceof Array ? x : [x])

export const ensureNumber = (x: number | string) => parseFloat(x as string)

export const fromPairs = <T>(pairs: [k?: string, v?: T, ...args: unknown[]][]) => {
  const r: Record<string, T> = {}

  for (const [k, v] of pairs) {
    if (k && v) {
      r[k] = v
    }
  }

  return r
}

export const flatten = <T>(xs: T[][]) => xs.flatMap(identity)

export const partition = <T>(f: (x: T) => boolean, xs: T[]) => {
  const a: T[] = []
  const b: T[] = []

  for (const x of xs) {
    if (f(x)) {
      a.push(x)
    } else {
      b.push(x)
    }
  }

  return [a, b]
}

export const uniq = <T>(xs: T[]) => Array.from(new Set(xs))

export const uniqBy = <T>(f: (x: T) => any, xs: T[]) => {
  const s = new Set<any>()
  const r = []

  for (const x of xs) {
    const k = f(x)

    if (s.has(k)) {
      continue
    }

    s.add(k)
    r.push(x)
  }

  return r
}

export const sortBy = <T>(f: (x: T) => number, xs: T[]) =>
  xs.sort((a: T, b: T) => f(a) - f(b))

export const groupBy = <T, K>(f: (x: T) => K, xs: T[]) => {
  const r = new Map<K, T[]>()

  for (const x of xs) {
    const k = f(x)
    let v = r.get(k)

    if (!v) {
      v = []
      r.set(k, v)
    }

    v.push(x)
  }

  return r
}

export const sample = <T>(n: number, xs: T[]) => {
  const result: T[] = []
  const limit = Math.min(n, xs.length)

  for (let i = 0; i < limit; i++) {
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

export const chunk = <T>(chunkLength: number, xs: T[]) => {
  const result: T[][] = []
  const current: T[] = []

  for (const item of xs) {
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

export const chunks = <T>(n: number, xs: T[]) => {
  const result: T[][] = initArray(n, () => [])

  for (let i = 0; i < xs.length; i++) {
    result[i % n].push(xs[i])
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

export const addToMapKey = <K, T>(m: Map<K, Set<T>>, k: K, v: T) => {
  const a = m.get(k) || new Set<T>()

  a.add(v)
  m.set(k, a)
}

export const pushToMapKey = <K, T>(m: Map<K, T[]>, k: K, v: T) => {
  const a = m.get(k) || []

  a.push(v)
  m.set(k, a)
}

// Random obscure stuff

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
