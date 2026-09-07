import {describe, it, expect} from "vitest"
import {userInbox, userOutbox, userMessaging, relay} from "@welshman/util"
import {getFilterSelections} from "@welshman/feeds"
import {App} from "../src/app.js"
import {Router} from "../src/plugins/router.js"

const URL = "wss://relay.example.com/"

describe("Router", () => {
  // A signed-out visitor is a legitimate state on a read path. Requiring a user
  // here rejected the whole resolution, taking every other selection with it.
  it("resolves user-scoped routes to no relays when there is no user", async () => {
    const router = new App().use(Router)

    for (const route of [
      {type: "userInbox"},
      {type: "userOutbox"},
      {type: "userMessaging"},
    ] as const) {
      await expect(router.resolveRoute(route)).resolves.toEqual([])
    }
  })

  it("keeps the rest of a selection when the user-scoped part contributes nothing", async () => {
    const scenario = await new App()
      .use(Router)
      .resolve([userInbox(), userOutbox(), userMessaging(), relay(URL)])

    expect(scenario.getUrls()).toEqual([URL])
  })

  // The feeds engine's own rules emit userInbox/userMessaging, so a rejection
  // here failed every feed for a logged-out visitor.
  it("resolves feed selections when there is no user", async () => {
    const selections = await getFilterSelections([{kinds: [1]}], new App().use(Router))

    expect(selections).toHaveLength(1)
    expect(selections[0].relays).toEqual([])
  })
})
