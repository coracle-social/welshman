import {throttle} from 'throttle-debounce'
import {bech32, utf8} from "@scure/base"

// Dealing with nil

export type Nil = null | undefined

export const isNil = (x: any) => [null, undefined].includes(x)

export type Maybe<T> = T | undefined

export const ifLet = <T>(x: T | undefined, f: (x: T) => void) => x === undefined ? undefined : f(x)

// Regular old utils

export const noop = (...args: unknown[]) => undefined

export const first = <T>(xs: T[], ...args: unknown[]) => xs[0]

export const ffirst = <T>(xs: T[][], ...args: unknown[]) => xs[0][0]

export const last = <T>(xs: T[], ...args: unknown[]) => xs[xs.length - 1]

export const identity = <T>(x: T, ...args: unknown[]) => x

export const always = <T>(x: T, ...args: unknown[]) => () => x

export const num = (x: Maybe<number>) => x || 0

export const add = (x: Maybe<number>, y: Maybe<number>) => num(x) + num(y)

export const sub = (x: Maybe<number>, y: Maybe<number>) => num(x) - num(y)

export const mul = (x: Maybe<number>, y: Maybe<number>) => num(x) * num(y)

export const div = (x: Maybe<number>, y: number) => num(x) / y

export const inc = (x: Maybe<number>) => add(x, 1)

export const dec = (x: Maybe<number>) => sub(x, 1)

export const lt = (x: Maybe<number>, y: Maybe<number>) => num(x) < num(y)

export const lte = (x: Maybe<number>, y: Maybe<number>) => num(x) <= num(y)

export const gt = (x: Maybe<number>, y: Maybe<number>) => num(x) > num(y)

export const gte = (x: Maybe<number>, y: Maybe<number>) => num(x) >= num(y)

export const max = (xs: Maybe<number>[]) => xs.reduce((a: number, b) => Math.max(num(a), num(b)), 0)

export const min = (xs: Maybe<number>[]) => xs.reduce((a: number, b) => Math.min(num(a), num(b)), 0)

export const sum = (xs: Maybe<number>[]) => xs.reduce((a: number, b) => add(a, b), 0)

export const avg = (xs: Maybe<number>[]) => sum(xs) / xs.length

export const drop = <T>(n: number, xs: T[]) => xs.slice(n)

export const take = <T>(n: number, xs: T[]) => xs.slice(0, n)

export const omit = <T extends Record<string, any>>(ks: string[], x: T) => {
  const r: T = {...x}

  for (const k of ks) {
    delete r[k]
  }

  return r
}

export const omitVals = <T extends Record<string, any>>(xs: any[], x: T) => {
  const r: Record<string, any> = {}

  for (const [k, v] of Object.entries(x)) {
    if (!xs.includes(v)) {
      r[k] = v
    }
  }

  return r as T
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

export const mapKeys = <T extends Record<string, any>>(f: (v: string) => string, x: T) => {
  const r: Record<string, any> = {}

  for (const [k, v] of Object.entries(x)) {
    r[f(k)] = v
  }

  return r as T
}

export const mapVals = <V, U>(f: (v: V) => U, x: Record<string, V>) => {
  const r: Record<string, U> = {}

  for (const [k, v] of Object.entries(x)) {
    r[k] = f(v)
  }

  return r
}

export const mergeLeft = <T extends Record<string, any>>(a: T, b: T) => ({...b, ...a})

export const mergeRight = <T extends Record<string, any>>(a: T, b: T) => ({...a, ...b})

export const between = ([low, high]: [number, number], n: number) => n > low && n < high

export const randomInt = (min = 0, max = 9) => min + Math.round(Math.random()) * (max - min)

export const randomId = (): string => Math.random().toString().slice(2)

export const stripProtocol = (url: string) => url.replace(/.*:\/\//, "")

export const displayUrl = (url: string) => stripProtocol(url).replace(/^(www\.)?/i, "").replace(/\/$/, "")

export const displayDomain = (url: string) => displayUrl(first(url.split(/[\/\?]/)))

export const sleep = (t: number) => new Promise(resolve => setTimeout(resolve, t))

export const concat = <T>(...xs: T[][]) => xs.flatMap(x => x || [])

export const append = <T>(x: T, xs: T[]) => concat(xs, [x])

export const union = <T>(a: T[], b: T[]) => uniq([...a, ...b])

export const intersection = <T>(a: T[], b: T[]) => {
  const s = new Set(b)

  return a.filter(x => s.has(x))
}

export const difference = <T>(a: T[], b: T[]) => {
  const s = new Set(b)

  return a.filter(x => !s.has(x))
}

export const remove = <T>(a: T, xs: T[]) => xs.filter(x => x !== a)

export const without = <T>(a: T[], b: T[]) => b.filter(x => !a.includes(x))

export const toggle = <T>(x: T, xs: T[]) => xs.includes(x) ? remove(x, xs) : append(x, xs)

export const clamp = ([min, max]: [number, number], n: number) => Math.min(max, Math.max(min, n))

export const parseJson = (json: string | Nil) => {
  if (!json) return null

  try {
    return JSON.parse(json)
  } catch (e) {
    return null
  }
}

export const getJson = (k: string) => parseJson(localStorage.getItem(k) || "")

export const setJson = (k: string, v: any) => localStorage.setItem(k, JSON.stringify(v))

export const tryCatch = <T>(f: () => T, onError?: (e: Error) => void): T | undefined => {
  try {
    const r = f()

    if (r instanceof Promise) {
      r.catch(e => onError?.(e as Error))
    }

    return r
  } catch (e) {
    onError?.(e as Error)
  }

  return undefined
}

export const ellipsize = (s: string, l: number, suffix = '...') => {
  if (s.length < l * 1.1) {
    return s
  }

  while (s.length > l && s.includes(' ')) {
    s = s.split(' ').slice(0, -1).join(' ')
  }

  return s + suffix
}

export const isPojo = (obj: any) => {
  if (obj === null || typeof obj !== "object") {
    return false
  }

  return Object.getPrototypeOf(obj) === Object.prototype
}

export const equals = (a: any, b: any) => {
  if (a === b) return true

  if (a instanceof Set && b instanceof Set) {
    a = Array.from(a)
    b = Array.from(b)
  }

  if (a instanceof Set) {
    if (!(b instanceof Set) || a.size !== b.size) {
      return false
    }

    return Array.from(a).every(x => b.has(x))
  }

  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) {
      return false
    }

    for (let i = 0; i < a.length; i++) {
      if (!equals(a[i], b[i])) {
        return false
      }
    }

    return true
  }

  if (isPojo(a)) {
    if (!isPojo(b)) {
      return false
    }

    const aKeys = Object.keys(a)
    const bKeys = Object.keys(b)

    if (aKeys.length !== bKeys.length) {
      return false
    }

    for (const k of aKeys) {
      if (!equals(a[k], b[k])) {
        return false
      }
    }

    return true
  }

  return false
}

// Curried utils

export const nth = (i: number) => <T>(xs: T[], ...args: unknown[]) => xs[i]

export const nthEq = (i: number, v: any) => (xs: any[], ...args: unknown[]) => xs[i] === v

export const nthNe = (i: number, v: any) => (xs: any[], ...args: unknown[]) => xs[i] !== v

export const eq = <T>(v: T) => (x: T) => x === v

export const ne = <T>(v: T) => (x: T) => x !== v

export const prop = (k: string) => <T>(x: Record<string, T>) => x[k]

export const assoc = <K extends string, T, U>(k: K, v: T) => (o: U) => ({...o, [k as K]: v}) as U & Record<K, T>

export const hash = (s: string) =>
  Math.abs(s.split("").reduce((a, b) => ((a << 5) - a + b.charCodeAt(0)) | 0, 0)).toString()

// Collections

export const splitAt = <T>(n: number, xs: T[]) => [xs.slice(0, n), xs.slice(n)]

export const choice = <T>(xs: T[]): T => xs[Math.floor(xs.length * Math.random())]

export const shuffle = <T>(xs: Iterable<T>): T[] => Array.from(xs).sort(() => Math.random() > 0.5 ? 1 : -1)

export const sample = <T>(n: number, xs: T[]) => shuffle(xs).slice(0, n)

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

export const sort = <T>(xs: T[]) => [...xs].sort()

export const sortBy = <T>(f: (x: T) => any, xs: T[]) =>
  [...xs].sort((a: T, b: T) => {
    const x = f(a)
    const y = f(b)

    return x < y ? -1 : x > y ? 1 : 0
  })

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

export const indexBy = <T, K>(f: (x: T) => K, xs: T[]) => {
  const r = new Map<K, T>()

  for (const x of xs) {
    r.set(f(x), x)
  }

  return r
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

export const once = (f: (...args: any) => void) => {
  let called = false

  return (...args: any) => {
    if (!called) {
      called = true
      f(...args)
    }
  }
}

export const memoize = <T>(f: (...args: any[]) => T) => {
  let prevArgs: any[]
  let result: T

  return (...args: any[]) => {
    if (!equals(prevArgs, args)) {
      prevArgs = args
      result = f(...args)
    }

    return result
  }
}

export const throttleWithValue = <T>(ms: number, f: () => T) => {
  let value: T

  const update = throttle(ms, () => {
    value = f()
  })

  return () => {
    update()

    return value
  }
}

export const batch = <T>(t: number, f: (xs: T[]) => void) => {
  const xs: T[] = []
  const cb = throttle(t, () => xs.length > 0 && f(xs.splice(0)))

  return (x: T) => {
    xs.push(x)
    cb()
  }
}

export const batcher = <T, U>(t: number, execute: (request: T[]) => U[] | Promise<U[]>) => {
  const queue: {request: T, resolve: (x: U) => void}[] = []

  const _execute = async () => {
    const items = queue.splice(0)
    const results = await execute(items.map(item => item.request))

    if (results.length !== items.length) {
      throw new Error("Execute must return a result for each request")
    }

    results.forEach(async (r, i) => items[i].resolve(await r))
  }

  return (request: T): Promise<U> =>
    new Promise(resolve => {
      if (queue.length === 0) {
        setTimeout(_execute, t)
      }

      queue.push({request, resolve})
    })
}

export const addToKey = <T>(m: Record<string, Set<T>>, k: string, v: T) => {
  const s = m[k] || new Set<T>()

  s.add(v)
  m[k] = s
}

export const pushToKey = <T>(m: Record<string, T[]>, k: string, v: T) => {
  const a = m[k] || []

  a.push(v)
  m[k] = a
}

export const addToMapKey = <K, T>(m: Map<K, Set<T>>, k: K, v: T) => {
  const s = m.get(k) || new Set<T>()

  s.add(v)
  m.set(k, s)
}

export const pushToMapKey = <K, T>(m: Map<K, T[]>, k: K, v: T) => {
  const a = m.get(k) || []

  a.push(v)
  m.set(k, a)
}

export const switcher = <T>(k: string, m: Record<string, T>) =>
  m[k] === undefined ? m.default : m[k]

// Time

export const MINUTE = 60

export const HOUR = 60 * MINUTE

export const DAY = 24 * HOUR

export const WEEK = 7 * DAY

export const MONTH = 30 * DAY

export const QUARTER = 90 * DAY

export const YEAR = 365 * DAY

export const int = (unit: number, count = 1) => unit * count

export const now = () => Math.round(Date.now() / 1000)

export const ago = (unit: number, count = 1) => now() - int(unit, count)

export const ms = (seconds: number) => seconds * 1000

// Fetch

type FetchOpts = {
  method?: string
  headers?: Record<string, string | boolean>
  body?: string | FormData
}

export const fetchJson = async (url: string, opts: FetchOpts = {}) => {
  if (!opts.headers) {
    opts.headers = {}
  }

  opts.headers["Accept"] = "application/json"

  const res = await fetch(url, opts as RequestInit)
  const json = await res.json()

  return json
}

export const postJson = async <T>(url: string, data: T, opts: FetchOpts = {}) => {
  if (!opts.method) {
    opts.method = "POST"
  }

  if (!opts.headers) {
    opts.headers = {}
  }

  opts.headers["Content-Type"] = "application/json"
  opts.body = JSON.stringify(data)

  return fetchJson(url, opts)
}

export const uploadFile = (url: string, fileObj: File) => {
  const body = new FormData()

  body.append("file", fileObj)

  return fetchJson(url, {method: "POST", body})
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
