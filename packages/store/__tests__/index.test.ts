import {TrustedEvent} from "@welshman/util"
import {Repository} from "@welshman/relay"
import {get} from "svelte/store"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {
  custom,
  deriveEvents,
  deriveEventsMapped,
  deriveIsDeleted,
  getter,
  synced,
  localStorageProvider,
  throttled,
  withGetter,
} from "../src/index"

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    clear: () => {
      store = {}
    },
  }
})()

vi.stubGlobal("localStorage", localStorageMock)

describe("Store utilities", () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe("synced", () => {
    it("should sync with localStorage", async () => {
      const store = await synced({
        key: "testKey",
        storage: localStorageProvider,
        defaultValue: "default",
      })

      // Wait for async initialization using vi.runAllTimersAsync
      await vi.runAllTimersAsync()

      expect(get(store)).toBe("default")

      store.set("new value")

      // Wait for async save using vi.runAllTimersAsync
      await vi.runAllTimersAsync()

      expect(localStorage.getItem("testKey")).toBe(JSON.stringify("new value"))
    })

    it("should load existing value from localStorage", async () => {
      localStorage.setItem("testKey", JSON.stringify("existing"))
      const store = await synced({
        key: "testKey",
        storage: localStorageProvider,
        defaultValue: "default",
      })

      // Wait for async initialization using vi.runAllTimersAsync
      await vi.runAllTimersAsync()

      expect(get(store)).toBe("existing")
    })
  })

  describe("getter", () => {
    it("should return current store value", async () => {
      const store = await synced({
        key: "test",
        storage: localStorageProvider,
        defaultValue: "initial",
      })

      // Wait for async initialization using vi.runAllTimersAsync
      await vi.runAllTimersAsync()

      const getValue = getter(store)

      expect(getValue()).toBe("initial")
      store.set("updated")
      expect(getValue()).toBe("updated")
    })
  })

  describe("withGetter", () => {
    it("should add getter to writable store", async () => {
      const store = withGetter(
        await synced({
          key: "test",
          storage: localStorageProvider,
          defaultValue: "initial",
        }),
      )

      // Wait for async initialization using vi.runAllTimersAsync
      await vi.runAllTimersAsync()

      expect(store.get()).toBe("initial")
      store.set("updated")
      expect(store.get()).toBe("updated")
    })
  })

  describe("throttled", () => {
    it("should throttle updates", async () => {
      const mockFn = vi.fn()
      const store = await synced({
        key: "test",
        storage: localStorageProvider,
        defaultValue: 0,
      })

      // Wait for async initialization using vi.runAllTimersAsync
      await vi.runAllTimersAsync()

      const throttledStore = throttled(100, store)

      throttledStore.subscribe(mockFn)

      store.set(1)
      store.set(2)
      store.set(3)

      expect(mockFn).toHaveBeenCalledTimes(1) // Initial call

      vi.advanceTimersByTime(100)
      expect(mockFn).toHaveBeenCalledTimes(2)
      expect(mockFn).toHaveBeenLastCalledWith(3)
    })
  })

  describe("custom", () => {
    it("should handle updates correctly", () => {
      const mockFn = vi.fn()
      const store = custom<number>(set => {
        set(0)
        return () => {}
      })

      store.subscribe(mockFn)
      store.set(1)
      store.update(n => n + 1)

      expect(mockFn).toHaveBeenCalledTimes(3) // Initial + set + update
      expect(store.get()).toBe(2)
    })
  })

  describe("Event-related stores", () => {
    const mockRepository = {
      query: vi.fn(),
      isDeleted: vi.fn(),
      isDeletedByAddress: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    } satisfies Partial<Repository>

    beforeEach(() => {
      vi.clearAllMocks()
    })

    describe("deriveEvents", () => {
      it("should derive events from repository", () => {
        const mockEvent = {id: "1", content: "test"} as TrustedEvent
        mockRepository.query.mockReturnValue([mockEvent])

        const store = deriveEvents(mockRepository as any, {
          filters: [],
        })

        const mockFn = vi.fn()
        store.subscribe(mockFn)

        expect(mockRepository.query).toHaveBeenCalled()
        expect(mockFn).toHaveBeenCalledWith([mockEvent])
      })
    })

    describe("deriveEventsMapped", () => {
      it("should map events to items", async () => {
        const mockEvent = {id: "1", content: "test"} as TrustedEvent
        mockRepository.query.mockReturnValue([mockEvent])

        const store = deriveEventsMapped(mockRepository as any, {
          filters: [],
          eventToItem: event => ({id: event.id, mapped: true}),
          itemToEvent: item => ({id: item.id, content: ""}) as TrustedEvent,
        })

        const mockFn = vi.fn()
        store.subscribe(mockFn)

        expect(mockRepository.query).toHaveBeenCalled()
        expect(mockFn).toHaveBeenCalledWith([{id: "1", mapped: true}])
      })

      it("should handle async eventToItem mapping", async () => {
        const mockEvent = {id: "1", content: "test"} as TrustedEvent
        mockRepository.query.mockReturnValue([mockEvent])

        const store = deriveEventsMapped(mockRepository as any, {
          filters: [],
          eventToItem: async event => ({id: event.id, mapped: true}),
          itemToEvent: item => ({id: item.id, content: ""}) as TrustedEvent,
        })

        const mockFn = vi.fn()
        store.subscribe(mockFn)

        // Wait for async operations to complete
        await vi.runAllTimersAsync()

        expect(mockRepository.query).toHaveBeenCalled()
        expect(mockFn).toHaveBeenCalledWith([{id: "1", mapped: true}])
      })

      it("should handle repository updates", () => {
        const mockEvent = {id: "1", content: "test"} as TrustedEvent
        mockRepository.query.mockReturnValue([mockEvent])

        const store = deriveEventsMapped(mockRepository as any, {
          filters: [{}],
          eventToItem: event => ({id: event.id, mapped: true}),
          itemToEvent: item => ({id: item.id, content: ""}) as TrustedEvent,
        })

        const mockFn = vi.fn()
        store.subscribe(mockFn)

        const [[_, callback]] = mockRepository.on.mock.calls

        callback({
          added: [{id: "2"} as TrustedEvent],
          removed: new Set([mockEvent.id]),
        })

        vi.advanceTimersByTime(300) // Wait for batch delay

        expect(mockFn).toHaveBeenLastCalledWith([{id: "2", mapped: true}])
      })
    })

    describe("deriveIsDeleted", () => {
      it("should track deletion status", () => {
        const mockEvent = {id: "1"} as TrustedEvent

        mockRepository.isDeleted.mockReturnValue(false)

        const store = deriveIsDeleted(mockRepository as any, mockEvent)
        const mockFn = vi.fn()
        store.subscribe(mockFn)

        expect(mockRepository.isDeleted).toHaveBeenCalledWith(mockEvent)
        expect(mockFn).toHaveBeenCalledWith(false)

        const [[_, callback]] = mockRepository.on.mock.calls

        callback()

        expect(mockRepository.isDeleted).toHaveBeenCalledWith(mockEvent)
        expect(mockFn).toHaveBeenCalledWith(false)
      })
    })
  })
})
