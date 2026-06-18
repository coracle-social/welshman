import {randomId} from "@welshman/lib"
import {WrappedSigner} from "@welshman/signer"
import type {ISigner} from "@welshman/signer"

/**
 * A structured, extensible log event. The built-in `signer` variant tracks each
 * signer operation (sign/encrypt/decrypt/getPubkey); the open variant lets
 * callers emit their own event types — it's not just a string.
 */
export type LogMessage =
  | {
      type: "signer"
      id: string
      method: string
      status: "pending" | "success" | "failure"
      error?: unknown
      at: number
    }
  | {type: string; at: number; [key: string]: unknown}

/**
 * An `ISigner` wrapper that emits a structured `LogMessage` (as a "message"
 * event on itself) for every operation it performs. `User.fromSigner` wraps
 * signers in this so they're observable; subscribe via `makeAppPolicyLogger`.
 */
export class LoggingSigner extends WrappedSigner {
  constructor(signer: ISigner) {
    super(signer, async (method, thunk) => {
      const id = randomId()

      this.emit("message", {type: "signer", id, method, status: "pending", at: Date.now()})

      try {
        const result = await thunk()

        this.emit("message", {type: "signer", id, method, status: "success", at: Date.now()})

        return result
      } catch (error) {
        this.emit("message", {type: "signer", id, method, status: "failure", error, at: Date.now()})

        throw error
      }
    })
  }
}
