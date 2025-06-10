import {defineConfig} from "vitepress"
import typeDocSidebar from "../reference/typedoc-sidebar.json"

export default defineConfig({
  title: "Welshman",
  description: "The official Welshman documentation",
  ignoreDeadLinks: true,
  themeConfig: {
    nav: [
      {text: "Guide", link: "/what-is-welshman"},
      {text: "Reference", link: "/reference/"},
    ],
    sidebar: {
      "/reference/": [...typeDocSidebar],
      "/": [
        {
          text: "Introduction",
          items: [
            {text: "What is Welshman", link: "/what-is-welshman"},
            {text: "Getting started", link: "/getting-started"},
          ],
        },
        {
          text: "@welshman/app",
          link: "/app/",
          items: [
            {text: "Session Management", link: "/app/session"},
            {text: "Relay Selection", link: "/app/relay-selection"},
            {text: "Making Requests", link: "/app/making-requests"},
            {text: "Publishing Events", link: "/app/publishing-events"},
            {text: "Tag utilities", link: "/app/tags"},
            {text: "Web of Trust", link: "/app/wot"},
            {text: "Storage", link: "/app/storage"},
            {text: "Context", link: "/app/context"},
          ],
        },
        {
          text: "@welshman/util",
          link: "/util/",
          items: [
            {text: "Kinds", link: "/util/kinds"},
            {text: "Address", link: "/util/address"},
            {text: "Links", link: "/util/links"},
            {text: "Events", link: "/util/events"},
            {text: "Filters", link: "/util/filters"},
            {text: "Tags", link: "/util/tags"},
            {text: "Encryptable", link: "/util/encryptable"},
            {text: "Relays", link: "/util/relay"},
            {text: "Profiles", link: "/util/profile"},
            {text: "Handlers", link: "/util/handlers"},
            {text: "Lists", link: "/util/list"},
            {text: "Zaps", link: "/util/zaps"},
            {text: "Relay Auth", link: "/util/nip42"},
            {text: "HTTP Auth", link: "/util/nip98"},
            {text: "Blossom", link: "/util/blossom"},
            {text: "Relay Management", link: "/util/nip86"},
          ],
        },
        {
          text: "@welshman/net",
          link: "/net/",
          items: [
            {text: "Context", link: "/net/context"},
            {text: "Messages", link: "/net/message"},
            {text: "Adapters", link: "/net/adapter"},
            {text: "Sockets", link: "/net/socket"},
            {text: "Pool", link: "/net/pool"},
            {text: "NIP 42 Auth", link: "/net/auth"},
            {text: "Socket Policy", link: "/net/policy"},
            {text: "Making Requests", link: "/net/request"},
            {text: "Publishing Events", link: "/net/publish"},
            {text: "Negentropy", link: "/net/diff"},
            {text: "Tracker", link: "/net/tracker"},
          ],
        },
        {
          text: "@welshman/signer",
          link: "/signer/",
          items: [
            {text: "ISigner", link: "/signer/isigner"},
            {text: "NIP 01", link: "/signer/nip-01"},
            {text: "NIP 07", link: "/signer/nip-07"},
            {text: "NIP 46", link: "/signer/nip-46"},
            {text: "NIP 55", link: "/signer/nip-55"},
            {text: "NIP 59", link: "/signer/nip-59"},
          ],
        },
        {
          text: "@welshman/relay",
          link: "/relay/",
          items: [],
        },
        {
          text: "@welshman/router",
          link: "/router/",
          items: [],
        },
        {
          text: "@welshman/content",
          link: "/content/",
          items: [
            {text: "Parser", link: "/content/parser"},
            {text: "Renderer", link: "/content/renderer"},
          ],
        },
        {
          text: "@welshman/editor",
          link: "/editor/",
          items: [],
        },
        {
          text: "@welshman/feeds",
          link: "/feeds/",
          items: [
            {text: "Core", link: "/feeds/core"},
            {text: "Utilities", link: "/feeds/utils"},
            {text: "Compiler", link: "/feeds/compiler"},
            {text: "Controller", link: "/feeds/controller"},
          ],
        },
        {
          text: "@welshman/store",
          link: "/store/",
          items: [
            {text: "Throttled", link: "/store/throttle"},
            {text: "Synced", link: "/store/synced"},
            {text: "Getter", link: "/store/getter"},
            {text: "Custom", link: "/store/custom"},
            {text: "Repository", link: "/store/repository"},
            {text: "Collections", link: "/store/collection"},
          ],
        },
        {
          text: "@welshman/lib",
          link: "/lib/",
          items: [
            {text: "Utilities", link: "/lib/tools"},
            {text: "LRU cache", link: "/lib/lru"},
            {text: "Task Queue", link: "/lib/task-queue"},
            {text: "Normalize URL", link: "/lib/normalize-url"},
            {text: "Deferred", link: "/lib/deferred"},
            {text: "Emitter", link: "/lib/emitter"},
          ],
        },
      ],
    },
    socialLinks: [{icon: "github", link: "https://github.com/vuejs/vitepress"}],
  },
})
