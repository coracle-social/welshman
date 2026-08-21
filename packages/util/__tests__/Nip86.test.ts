import {describe, expect, it} from "vitest"
import {makeCreateRole, makeEditRole} from "../src/Nip86"

describe("Nip86", () => {
  // A relay decodes these positionally and by type. Sending a hue as a string is not a type
  // error there — khatru discards the failed assertion and the role is stored with hue 0 — so
  // the wire types are pinned here rather than left to the relay to complain about.
  describe("role management", () => {
    it("sends a role's hue and order as numbers", () => {
      const {method, params} = makeCreateRole("id", "Bosun", "Keeps order", 200, 1)

      expect(method).toBe("createrole")
      expect(params).toEqual(["id", "Bosun", "Keeps order", 200, 1])
      expect(typeof params[3]).toBe("number")
      expect(typeof params[4]).toBe("number")
    })

    it("edits a role with the same shape it was created with", () => {
      const {method, params} = makeEditRole("id", "Bosun", "Keeps order", 200, 1)

      expect(method).toBe("editrole")
      expect(params).toEqual(["id", "Bosun", "Keeps order", 200, 1])
    })
  })
})
