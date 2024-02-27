export const now = () => Math.round(Date.now() / 1000)

export const nth = (i: number) => <T>(xs: T[]) => xs[i]

export const first = <T>(xs: T[]) => xs[0]

export const last = <T>(xs: T[]) => xs[xs.length - 1]

export const identity = <T>(x: T) => x

export const between = (low: number, high: number, n: number) => n > low && n < high

export const flatten = <T>(xs: T[]) => xs.flatMap(identity)

export const uniq = <T>(xs: T[]) => Array.from(new Set(xs))

export const isIterable = (x: any) => Symbol.iterator in Object(x)

export const toIterable = (x: any) => isIterable(x) ? x : [x]

export const stripProtocol = (url: string) => url.replace(/.*:\/\//, "")

// https://github.com/microsoft/TypeScript/issues/4628#issuecomment-1147905253
export type OmitAllStatics<T extends {new(...args: any[]): any, prototype: any}> =
    T extends {new(...args: infer A): infer R, prototype: infer P} ?
        {new(...args: A): R, prototype: P} :
        never;

export const fromNostrURI = (s: string) => s.replace(/^[\w+]+:\/?\/?/, "")

export const toNostrURI = (s: string) => `nostr:${s}`
