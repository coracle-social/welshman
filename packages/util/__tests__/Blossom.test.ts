import {afterEach, describe, expect, it, vi} from "vitest"
import {getPubkey, hash, makeSecret, own, sign} from "../src/Keys"
import {BLOSSOM_AUTH} from "../src/Kinds"
import {
  canUploadBlob,
  checkBlobExists,
  deleteBlob,
  getBlob,
  listBlobs,
  makeBlossomAuthEvent,
  mirrorBlob,
  uploadBlob,
} from "../src/Blossom"

const server = "https://blossom.example.com/some/path"
const sha256 = "b1674191a88ec5cdd733e4240a81803105dc412d6c6708d53ab94fc248f4f553"
const blobUrl = `https://other.example.com/${sha256}.pdf`

const mockFetch = () => {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response("{}"))

  vi.stubGlobal("fetch", fetchMock)

  return fetchMock
}

describe("Blossom", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe("mirrorBlob", () => {
    it("puts the blob's url as json to the server's mirror endpoint", async () => {
      const fetchMock = mockFetch()

      await mirrorBlob(server, blobUrl)

      const [url, init] = fetchMock.mock.calls[0]

      expect(url).toBe("https://blossom.example.com/mirror")
      expect(init?.method).toBe("PUT")
      expect(JSON.parse(init?.body as string)).toEqual({url: blobUrl})
      expect((init?.headers as Record<string, string>)["Content-Type"]).toBe("application/json")
    })

    it("sends an upload authorization carrying the blob's hash", async () => {
      const fetchMock = mockFetch()
      const template = makeBlossomAuthEvent({action: "upload", server, hashes: [sha256]})
      const secret = makeSecret()
      const authEvent = sign(hash(own(template, getPubkey(secret))), secret)

      await mirrorBlob(server, blobUrl, {authEvent})

      const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>
      const [scheme, encoded] = headers.Authorization.split(" ")
      const event = JSON.parse(atob(encoded))

      expect(scheme).toBe("Nostr")
      expect(event.kind).toBe(BLOSSOM_AUTH)
      expect(event.tags).toContainEqual(["t", "upload"])
      expect(event.tags).toContainEqual(["x", sha256])
    })

    it("returns the server's response for the caller to read the descriptor from", async () => {
      const descriptor = {url: `https://blossom.example.com/${sha256}.pdf`, sha256, size: 1}

      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(JSON.stringify(descriptor))),
      )

      const response = await mirrorBlob(server, blobUrl)

      expect(await response.json()).toEqual(descriptor)
    })
  })

  describe("signal", () => {
    it("passes the signal to fetch for every request that takes one", async () => {
      const fetchMock = mockFetch()
      const {signal} = new AbortController()

      await uploadBlob(server, new ArrayBuffer(1), {signal})
      await mirrorBlob(server, blobUrl, {signal})
      await deleteBlob(server, sha256, {signal})
      await listBlobs(server, "pubkey", {signal})
      await canUploadBlob(server, {signal})
      await checkBlobExists(server, sha256, {signal})
      await getBlob(server, sha256, {signal})

      expect(fetchMock).toHaveBeenCalledTimes(7)

      for (const [, init] of fetchMock.mock.calls) {
        expect(init?.signal).toBe(signal)
      }
    })

    it("rejects when the caller aborts", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(
          (_url: string, init?: RequestInit) =>
            new Promise((_resolve, reject) => {
              init?.signal?.addEventListener("abort", () => reject(init.signal!.reason))
            }),
        ),
      )

      const controller = new AbortController()
      const request = mirrorBlob(server, blobUrl, {signal: controller.signal})

      controller.abort(new Error("stalled"))

      await expect(request).rejects.toThrow("stalled")
    })

    it("gives up on an upload preflight the server never answers", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(
          (_url: string, init?: RequestInit) =>
            new Promise((_resolve, reject) => {
              init?.signal?.addEventListener("abort", () => reject(init.signal!.reason))
            }),
        ),
      )

      const controller = new AbortController()
      const request = canUploadBlob(server, {signal: controller.signal})

      controller.abort(new Error("stalled"))

      await expect(request).rejects.toThrow("stalled")
    })
  })
})
