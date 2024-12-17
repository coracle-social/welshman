import type {Context} from "@welshman/lib"

/**
 * A global context variable for configuring libraries and applications.
 *
 * In your application, you'll want to add something like the following to your types.d.ts:
 * type MyContext = {
 *   x: number
 * }
 *
 * declare module "@welshman/lib" {
 *   interface Context {
 *     net: MyContext
 *   }
 * }
 */
export const ctx: Context = {}

/**
 * Adds data to ctx.
 */
export const setContext = (newCtx: Context) => Object.assign(ctx, newCtx)
