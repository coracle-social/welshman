import {describe, expect, it} from "vitest"
import {defer, makePromise} from "../src/Deferred"

describe("Deferred", () => {
  const pubkey = "ee".repeat(32)
  const eventId = "ff".repeat(32)

  type SuccessResponse = {
    eventId: string
    pubkey: string
    success: true
  }

  type ErrorResponse = {
    code: number
    message: string
    success: false
  }

  describe("makePromise", () => {
    it("should create a promise that resolves", async () => {
      const successData: SuccessResponse = {
        eventId: eventId,
        pubkey: pubkey,
        success: true,
      }

      const promise = makePromise<SuccessResponse, ErrorResponse>(resolve => {
        resolve(successData)
      })

      const result = await promise
      expect(result).toEqual(successData)
    })

    it("should create a promise that rejects", async () => {
      const errorData: ErrorResponse = {
        code: 404,
        message: "Event not found",
        success: false,
      }

      const promise = makePromise<SuccessResponse, ErrorResponse>((_, reject) => {
        reject(errorData)
      })

      await expect(promise).rejects.toEqual(errorData)
    })

    it("should handle async operations", async () => {
      const successData: SuccessResponse = {
        eventId: eventId,
        pubkey: pubkey,
        success: true,
      }

      const promise = makePromise<SuccessResponse, ErrorResponse>(resolve => {
        setTimeout(() => resolve(successData), 100)
      })

      const result = await promise
      expect(result).toEqual(successData)
    })

    it("should propagate errors in promise chain", async () => {
      const errorData: ErrorResponse = {
        code: 500,
        message: "Internal error",
        success: false,
      }

      const promise = makePromise<SuccessResponse, ErrorResponse>((_, reject) => {
        setTimeout(() => reject(errorData), 100)
      })

      await expect(promise).rejects.toEqual(errorData)
    })
  })

  describe("defer", () => {
    it("should create a deferred promise that can be resolved", async () => {
      const deferred = defer<SuccessResponse, ErrorResponse>()

      const successData: SuccessResponse = {
        eventId: eventId,
        pubkey: pubkey,
        success: true,
      }

      // Resolve in next tick to test async behavior
      setTimeout(() => {
        deferred.resolve(successData)
      }, 0)

      const result = await deferred
      expect(result).toEqual(successData)
    })

    it("should create a deferred promise that can be rejected", async () => {
      const deferred = defer<SuccessResponse, ErrorResponse>()

      const errorData: ErrorResponse = {
        code: 403,
        message: "Unauthorized",
        success: false,
      }

      setTimeout(() => {
        deferred.reject(errorData)
      }, 0)

      await expect(deferred).rejects.toEqual(errorData)
    })

    it("should handle immediate resolution", async () => {
      const deferred = defer<SuccessResponse, ErrorResponse>()

      const successData: SuccessResponse = {
        eventId: eventId,
        pubkey: pubkey,
        success: true,
      }

      deferred.resolve(successData)
      const result = await deferred
      expect(result).toEqual(successData)
    })

    it("should handle immediate rejection", async () => {
      const deferred = defer<SuccessResponse, ErrorResponse>()

      const errorData: ErrorResponse = {
        code: 400,
        message: "Bad request",
        success: false,
      }

      deferred.reject(errorData)
      await expect(deferred).rejects.toEqual(errorData)
    })

    it("should work with promise chaining", async () => {
      const deferred = defer<SuccessResponse, ErrorResponse>()

      const successData: SuccessResponse = {
        eventId: eventId,
        pubkey: pubkey,
        success: true,
      }

      // Create a chain of promises
      const chainedPromise = deferred
        .then(result => ({
          ...result,
          eventId: result.eventId.toUpperCase(),
        }))
        .catch(error => {
          throw {...error, code: 599}
        })

      deferred.resolve(successData)

      const result = await chainedPromise
      expect(result.eventId).toBe(eventId.toUpperCase())
    })

    it("should handle error propagation in chains", async () => {
      const deferred = defer<SuccessResponse, ErrorResponse>()

      const errorData: ErrorResponse = {
        code: 401,
        message: "Unauthorized",
        success: false,
      }

      const chainedPromise = deferred
        .then(result => result)
        .catch(error => {
          throw {...error, code: 599}
        })

      deferred.reject(errorData)

      await expect(chainedPromise).rejects.toEqual({
        ...errorData,
        code: 599,
      })
    })

    it("should maintain type safety with default error type", async () => {
      const deferred = defer<string>() // Using default error type

      const successData = eventId
      const errorData = "Error processing event"

      setTimeout(() => {
        if (Math.random() > 0.5) {
          deferred.resolve(successData)
        } else {
          deferred.reject(errorData)
        }
      }, 0)

      try {
        const result = await deferred
        expect(result).toBe(successData)
      } catch (error) {
        expect(error).toBe(errorData)
      }
    })
  })
})
