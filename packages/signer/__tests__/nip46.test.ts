import {afterAll, beforeEach, describe, expect, it, vi} from "vitest"
import {
  Nip46Signer,
  Nip46Broker,
  Nip46Event,
  Nip46Receiver,
  Nip46Sender,
  Nip46Request,
  Nip46Response,
  Nip46BrokerParams,
} from "../src/signers/nip46"
import {testSigner} from "./common"
import {NOSTR_CONNECT, SignedEvent, TrustedEvent} from "@welshman/util"
import {publish, subscribe, SubscriptionEvent} from "@welshman/net"
import {now} from "@welshman/lib"

const mockSubscription = {
  on: vi.fn(),
  close: vi.fn(),
}

vi.mock(import("@welshman/net"), async importOriginal => ({
  ...(await importOriginal()),
  subscribe: vi.fn().mockImplementation(() => mockSubscription),
  publish: vi.fn().mockImplementation(() => ({
    emitter: {
      on: vi.fn(),
    },
  })),
}))

describe("Nip46Signer", () => {
  let mockBroker: any

  const signerPubkey = "ee".repeat(32)

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockBroker = {
      getPublicKey: vi.fn().mockResolvedValue("ee".repeat(32)),
      signEvent: vi.fn().mockResolvedValue({sig: "ff".repeat(64)} as SignedEvent),
      nip04Encrypt: vi.fn((pubkey, message) => "encrypted:" + message),
      nip04Decrypt: vi.fn((pubkey, encryptedMessage) => encryptedMessage.split("encrypted:")[1]),
      nip44Encrypt: vi.fn((pubkey, message) => "encrypted:" + message),
      nip44Decrypt: vi.fn((pubkey, encryptedMessage) => encryptedMessage.split("encrypted:")[1]),
    }
  })

  afterAll(() => {
    vi.useRealTimers()
  })

  testSigner("Nip46Signer", () => new Nip46Signer(mockBroker))

  describe("Nip46Receiver", () => {
    let mockSigner: any
    let receiver: Nip46Receiver

    beforeEach(() => {
      mockSigner = {
        getPubkey: vi.fn().mockResolvedValue("test-pubkey"),
        nip04: {
          decrypt: vi.fn().mockResolvedValue('{"method":"test","params":[]}'),
        },
        nip44: {
          decrypt: vi.fn().mockResolvedValue('{"method":"test","params":[]}'),
        },
      }

      receiver = new Nip46Receiver(mockSigner, {
        relays: ["wss://relay.test"],
        clientSecret: "test-secret",
      })
    })

    it("should setup subscription with correct filters", async () => {
      receiver.start()
      await vi.advanceTimersToNextTimerAsync()
      expect(subscribe).toHaveBeenCalledWith({
        relays: ["wss://relay.test"],
        filters: [
          {
            kinds: [NOSTR_CONNECT],
            "#p": ["test-pubkey"],
          },
        ],
      })
    })

    it("should handle incoming events", async () => {
      const receiveSpy = vi.fn()
      receiver.on(Nip46Event.Receive, receiveSpy)

      receiver.start()

      await vi.advanceTimersToNextTimerAsync()

      // Get the event handler
      const eventHandler = (mockSubscription as any).on.mock.calls.find(
        call => call[0] === SubscriptionEvent.Event,
      )[1]

      // Simulate incoming event
      await eventHandler("wss://relay.test", {
        pubkey: "sender-pubkey",
        content: "encrypted-content",
      } as TrustedEvent)

      expect(receiveSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          url: "wss://relay.test",
          event: expect.any(Object),
        }),
      )
    })

    it("should cleanup on stop", async () => {
      receiver.start()
      await vi.advanceTimersToNextTimerAsync()
      receiver.stop()

      expect(mockSubscription.close).toHaveBeenCalled()
    })
  })

  describe("Nip46Sender", () => {
    let mockSigner: any
    let sender: Nip46Sender
    let mockPublish: any

    beforeEach(() => {
      vi.clearAllMocks()
      mockSigner = {
        getPubkey: vi.fn().mockResolvedValue("test-pubkey"),
        sign: vi.fn(template => ({...template, sig: "ee".repeat(64)})),
        nip44: {
          encrypt: vi.fn((pub, message) => "encrypted:" + message),
        },
      }

      mockPublish = {
        emitter: {on: vi.fn()},
      }
      vi.mocked(publish).mockReturnValue(mockPublish)

      sender = new Nip46Sender(mockSigner, {
        relays: ["wss://relay.test"],
        clientSecret: "test-secret",
        signerPubkey,
      })
    })

    it("should encrypt and send request", async () => {
      const request = new Nip46Request("test-method", ["param1"])
      await sender.send(request)

      expect(mockSigner.nip44.encrypt).toHaveBeenCalledWith(signerPubkey, expect.any(String))
      expect(publish).toHaveBeenCalledWith(
        expect.objectContaining({
          relays: ["wss://relay.test"],
          event: expect.any(Object),
        }),
      )
    })

    it("should throw error if no signer pubkey", async () => {
      sender = new Nip46Sender(mockSigner, {
        relays: ["wss://relay.test"],
        clientSecret: "test-secret",
      })

      const request = new Nip46Request("test-method", ["param1"])
      await expect(sender.send(request)).rejects.toThrow("signer pubkey")
    })

    it("should process queue sequentially", async () => {
      const request1 = new Nip46Request("method1", ["param1"])
      const request2 = new Nip46Request("method2", ["param2"])

      sender.enqueue(request1)
      sender.enqueue(request2)

      await vi.runAllTimersAsync()

      // Check that requests were processed in order
      const calls = vi.mocked(publish).mock.calls
      expect(calls[0][0].event.content).toContain("method1")
      expect(calls[1][0].event.content).toContain("method2")
    })
  })

  describe("Nip46Request", () => {
    let mockReceiver: any
    let mockSender: any
    let request: Nip46Request

    beforeEach(() => {
      vi.clearAllMocks()
      vi.useFakeTimers()
      mockReceiver = {
        start: vi.fn().mockResolvedValue(undefined),
        on: vi.fn(),
        off: vi.fn(),
      }

      mockSender = {
        enqueue: vi.fn(),
      }

      request = new Nip46Request("test-method", ["param1"])
    })

    afterAll(() => {
      vi.useRealTimers()
    })

    it("should handle successful response", async () => {
      // Setup response handler
      let responseHandler: (response: Nip46Response) => void
      mockReceiver.on.mockImplementation((event, handler) => {
        responseHandler = handler
      })

      // Start listening
      const listenPromise = request.listen(mockReceiver)

      await vi.advanceTimersToNextTimerAsync()

      // Simulate successful response
      responseHandler!({
        id: request.id,
        url: "wss://relay.test",
        event: {} as TrustedEvent,
        result: "success",
      })

      await listenPromise

      const result = await request.promise
      expect(result.result).toBe("success")
    })

    it("should handle error response", async () => {
      let responseHandler: (response: Nip46Response) => void
      mockReceiver.on.mockImplementation((event, handler) => {
        responseHandler = handler
      })

      const listenPromise = request.listen(mockReceiver)

      await vi.advanceTimersToNextTimerAsync()

      responseHandler!({
        id: request.id,
        url: "wss://relay.test",
        event: {} as TrustedEvent,
        error: "test error",
      })

      await listenPromise

      await expect(request.promise).rejects.toMatchObject({
        error: "test error",
      })
    })

    it("should handle auth_url result", async () => {
      const popupSpy = vi.spyOn(window, "open")
      let responseHandler: (response: Nip46Response) => void
      mockReceiver.on.mockImplementation((event, handler) => {
        responseHandler = handler
      })

      const listenPromise = request.listen(mockReceiver)

      await vi.advanceTimersToNextTimerAsync()

      responseHandler!({
        id: request.id,
        url: "wss://relay.test",
        event: {} as TrustedEvent,
        result: "auth_url",
        error: "https://auth.test",
      })

      await listenPromise

      expect(popupSpy).toHaveBeenCalledWith(
        "https://auth.test",
        expect.any(String),
        expect.any(String),
      )
    })

    it("should ignore responses with different ids", async () => {
      let responseHandler: (response: Nip46Response) => void
      mockReceiver.on.mockImplementation((event, handler) => {
        responseHandler = handler
      })

      const listenPromise = request.listen(mockReceiver)

      await vi.advanceTimersToNextTimerAsync()

      responseHandler!({
        id: "different-id",
        url: "wss://relay.test",
        event: {} as TrustedEvent,
        result: "success",
      })

      await listenPromise

      // Promise should not be resolved
      const promiseStatus = await Promise.race([
        request.promise,
        vi.advanceTimersByTimeAsync(100).then(() => "timeout"),
      ])

      expect(promiseStatus).toBe("timeout")
    })

    it("should enqueue request on send", async () => {
      await request.send(mockSender)
      expect(mockSender.enqueue).toHaveBeenCalledWith(request)
    })
  })

  describe("Nip46Broker", () => {
    let defaultParams: Nip46BrokerParams
    const pubkey = "cc".repeat(32)
    beforeEach(() => {
      vi.clearAllMocks()
      defaultParams = {
        relays: ["wss://relay.test"],
        clientSecret: "dd".repeat(32),
        signerPubkey: "ee".repeat(32),
      }
    })

    describe("singleton management", () => {
      it("should maintain single instance with same params", () => {
        const broker1 = Nip46Broker.get(defaultParams)
        const broker2 = Nip46Broker.get(defaultParams)
        expect(broker1).toBe(broker2)
      })

      it("should create new instance with different params", () => {
        const broker1 = Nip46Broker.get(defaultParams)
        const broker2 = Nip46Broker.get({
          ...defaultParams,
          relays: ["wss://other.relay"],
        })
        expect(broker1).not.toBe(broker2)
      })

      it("should teardown old instance when creating new one", () => {
        const broker1 = Nip46Broker.get(defaultParams)
        const teardownSpy = vi.spyOn(broker1, "teardown")

        Nip46Broker.get({
          ...defaultParams,
          relays: ["wss://other.relay"],
        })

        expect(teardownSpy).toHaveBeenCalled()
      })
    })

    describe("URL handling", () => {
      it("should parse bunker URL correctly", () => {
        const url = `bunker://${pubkey}?relay=wss://relay1.test&relay=wss://relay2.test&secret=testsecret`
        const result = Nip46Broker.parseBunkerUrl(url)

        expect(result).toEqual({
          signerPubkey: pubkey,
          relays: ["wss://relay1.test/", "wss://relay2.test/"],
          connectSecret: "testsecret",
        })
      })

      it("should handle invalid bunker URL", () => {
        const result = Nip46Broker.parseBunkerUrl("invalid-url")

        expect(result).toEqual({
          signerPubkey: "",
          connectSecret: "",
          relays: [],
        })
      })

      it("should generate bunker URL", () => {
        const broker = new Nip46Broker(defaultParams)
        const url = broker.getBunkerUrl()

        expect(url).toContain("bunker://")
        expect(url).toContain(defaultParams.signerPubkey)
        expect(url).toContain(encodeURIComponent(defaultParams.relays[0]))
      })

      it("should throw when generating bunker URL without signerPubkey", () => {
        const broker = new Nip46Broker({
          ...defaultParams,
          signerPubkey: undefined,
        })

        expect(() => broker.getBunkerUrl()).toThrow("no signerPubkey")
      })

      it("should generate nostrconnect URL", async () => {
        const broker = new Nip46Broker(defaultParams)
        const url = await broker.makeNostrconnectUrl({app: "test"})

        expect(url).toContain("nostrconnect://")
        expect(url).toContain("app=test")
        expect(url).toContain("secret=")
        expect(url).toContain(encodeURIComponent(defaultParams.relays[0]))
      })
    })

    describe("connection handling", () => {
      it("should handle nostrconnect response", async () => {
        const broker = new Nip46Broker(defaultParams)
        const url = await broker.makeNostrconnectUrl()

        // Start waiting for response
        const connectPromise = broker.waitForNostrconnect(url)

        // Get the secret from the URL we're connecting to
        const secret = new URL(url).searchParams.get("secret")

        // Simulate a response through the broker's receiver
        broker.receiver.emit(Nip46Event.Receive, {
          result: secret,
          event: {pubkey: "responder-pubkey"},
        })

        const response = await connectPromise
        expect(broker.params.signerPubkey).toBe("responder-pubkey")
      })

      it("should handle connection abort", async () => {
        const broker = new Nip46Broker(defaultParams)
        const url = await broker.makeNostrconnectUrl()
        const controller = new AbortController()

        const connectPromise = broker.waitForNostrconnect(url, controller)
        controller.abort()

        await expect(connectPromise).rejects.toBeUndefined()
      })
    })

    describe("NIP-46 methods", () => {
      let broker: Nip46Broker

      beforeEach(() => {
        broker = new Nip46Broker(defaultParams)
      })

      it("should send ping request", async () => {
        const pingPromise = broker.ping()

        // We need to wait a tick for the request to be created and registered
        await vi.runAllTimersAsync()

        // Make sure we started the handshake with the remote signer
        const sentHandler = (mockSubscription as any).on.mock.calls.find(
          call => call[0] === SubscriptionEvent.Send,
        )[1]
        // the sub was sent
        sentHandler()

        let req = {} as Nip46Request

        // catch up the send event to get the request id
        broker.sender.on(Nip46Event.Send, (res: Nip46Request) => (req = res))

        await vi.runAllTimersAsync()

        // The receiver should emit a response with the same ID as the request
        broker.receiver.emit(Nip46Event.Receive, {
          id: req?.id,
          result: "pong",
          error: undefined,
          event: {} as TrustedEvent,
          url: "wss://test.relay",
        })

        const result = await pingPromise
        expect(result).toBe("pong")
      })

      it("should get public key", async () => {
        const pubkeyPromise = broker.getPublicKey()

        await vi.runAllTimersAsync()

        // Make sure we started the handshake with the remote signer
        const sentHandler = (mockSubscription as any).on.mock.calls.find(
          call => call[0] === SubscriptionEvent.Send,
        )[1]
        // the sub handshake was sent
        sentHandler()

        let req = {} as Nip46Request

        // catch up the send event to get the request id
        broker.sender.on(Nip46Event.Send, (res: Nip46Request) => (req = res))

        await vi.runAllTimersAsync()

        expect(req.method).toBe("get_public_key")

        // Simulate response
        broker.receiver.emit(Nip46Event.Receive, {
          id: req.id,
          result: "test-pubkey",
          error: undefined,
          event: {} as TrustedEvent,
          url: "wss://test.relay",
        })

        const result = await pubkeyPromise
        expect(result).toBe("test-pubkey")
      })

      it("should sign event", async () => {
        const event = {kind: 1, pubkey, created_at: now(), content: "test", tags: []}
        const signedEvent = {...event, sig: "signature"}

        const signPromise = broker.signEvent(event)

        await vi.runAllTimersAsync()

        // Make sure we started the handshake with the remote signer
        const sentHandler = (mockSubscription as any).on.mock.calls.find(
          call => call[0] === SubscriptionEvent.Send,
        )[1]
        // the sub handshake was sent
        sentHandler()

        let req = {} as Nip46Request

        // catch up the request send event to get the request id
        broker.sender.on(Nip46Event.Send, (res: Nip46Request) => (req = res))

        await vi.runAllTimersAsync()

        // Simulate response
        broker.receiver.emit(Nip46Event.Receive, {id: req.id, result: JSON.stringify(signedEvent)})

        const result = await signPromise

        expect(result).toEqual(signedEvent)
      })

      it("should handle encryption methods", async () => {
        const encryptPromise = broker.nip04Encrypt("bb".repeat(32), "message")

        await vi.runAllTimersAsync()

        // Make sure we started the handshake with the remote signer
        const sentHandler = (mockSubscription as any).on.mock.calls.find(
          call => call[0] === SubscriptionEvent.Send,
        )[1]
        // the sub handshake was sent
        sentHandler()

        let req = {} as Nip46Request

        // catch up the request send event to get the request id
        broker.sender.on(Nip46Event.Send, (res: Nip46Request) => (req = res))

        await vi.runAllTimersAsync()

        // Simulate response
        broker.receiver.emit(Nip46Event.Receive, {id: req.id, result: "encrypted"})

        const result = await encryptPromise

        expect(result).toBe("encrypted")
      })
    })

    describe("error handling", () => {
      it("should handle request timeout", async () => {
        // const broker = new Nip46Broker({
        //   ...defaultParams,
        //   timeout: 100,
        // })
        // const pingPromise = broker.ping()
        // await expect(pingPromise).rejects.toThrow()
      })

      it("should handle request errors", async () => {
        const broker = new Nip46Broker(defaultParams)

        const pingPromise = broker.ping()

        // We need to wait a tick for the request to be created and registered
        await vi.runAllTimersAsync()

        // Make sure we started the handshake with the remote signer
        const sentHandler = (mockSubscription as any).on.mock.calls.find(
          call => call[0] === SubscriptionEvent.Send,
        )[1]
        // the sub was sent
        sentHandler()

        let req = {} as Nip46Request

        // catch up the send event to get the request id
        broker.sender.on(Nip46Event.Send, (res: Nip46Request) => (req = res))

        await vi.runAllTimersAsync()

        // The receiver should emit a response with the same ID as the request
        broker.receiver.emit(Nip46Event.Receive, {
          id: req?.id,
          result: "",
          error: "test error",
          event: {} as TrustedEvent,
          url: "wss://test.relay",
        })

        await expect(pingPromise).rejects.toMatchObject({error: "test error"})
      })
    })

    describe("state management", () => {
      it("should update params correctly", () => {
        const broker = new Nip46Broker(defaultParams)
        const newParams = {
          signerPubkey: "new-pubkey",
          algorithm: "nip04" as const,
        }

        broker.setParams(newParams)

        expect(broker.params).toEqual({
          ...defaultParams,
          ...newParams,
        })
      })

      it("should cleanup on teardown", () => {
        const broker = new Nip46Broker(defaultParams)
        const senderStopSpy = vi.spyOn(broker.sender, "stop")
        const receiverStopSpy = vi.spyOn(broker.receiver, "stop")

        broker.teardown()

        expect(senderStopSpy).toHaveBeenCalled()
        expect(receiverStopSpy).toHaveBeenCalled()
      })
    })
  })

  describe("Nip46Broker", () => {
    // Test broker-specific functionality
    it("should parse bunker URL correctly", () => {
      const url = `bunker://${signerPubkey}?relay=wss://relay1&relay=wss://relay2&secret=123`
      const result = Nip46Broker.parseBunkerUrl(url)
      expect(result).toEqual({
        signerPubkey,
        relays: ["wss://relay1/", "wss://relay2/"],
        connectSecret: "123",
      })
    })
  })
})
