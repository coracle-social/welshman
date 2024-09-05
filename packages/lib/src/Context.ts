import type {Context} from '@welshman/lib'

export const ctx: Context = {}

export const setContext = (newCtx: Context) => Object.assign(ctx, newCtx)
