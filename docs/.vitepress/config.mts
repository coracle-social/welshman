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
            {text: "Address", link: "/util/address"},
            {text: "Kinds", link: "/util/kinds"},
            {text: "Encryptable", link: "/util/encryptable"},
            {text: "Events", link: "/util/events"},
            {text: "Filters", link: "/util/filters"},
            {text: "Handlers", link: "/util/handlers"},
            {text: "Links", link: "/util/links"},
            {text: "Profile", link: "/util/profile"},
            {text: "Relay", link: "/util/relay"},
            {text: "Repository", link: "/util/repository"},
            {text: "Tags", link: "/util/tags"},
            {text: "Zaps", link: "/util/zaps"},
          ],
        },
        {
          text: "@welshman/net",
          link: "/net/",
          items: [
            {text: "Context", link: "/net/context"},
            {text: "Executor", link: "/net/executor"},
            {text: "Subscribe", link: "/net/subscribe"},
            {text: "Publish", link: "/net/publish"},
            {text: "Sync", link: "/net/sync"},
            {text: "Pool", link: "/net/pool"},
            {text: "Targets", link: "/net/targets"},
            {text: "Tracker", link: "/net/tracker"},
            {text: "Connection", link: "/net/connection"},
            {text: "Socket", link: "/net/socket"},
          ],
        },
        {
          text: "@welshman/signer",
          link: "/signer/",
          items: [
            {text: "ISigner", link: "/signer/isigner"},
            {text: "NIP-01", link: "/signer/nip-01"},
            {text: "NIP-07", link: "/signer/nip-07"},
            {text: "NIP-46", link: "/signer/nip-46"},
            {text: "NIP-55", link: "/signer/nip-55"},
            {text: "NIP-59", link: "/signer/nip-59"},
          ],
        },
        {
          text: "@welshman/relay",
          link: "/relay/",
          items: [
          ],
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
          text: "@welshman/dvm",
          link: "/dvm/",
          items: [
            {text: "Handler", link: "/dvm/handler"},
            {text: "Request", link: "/dvm/request"},
          ],
        },
        {
          text: "@welshman/store",
          link: "/store/",
          items: [
            {text: "Basic utilities", link: "/store/basic"},
            {text: "Event stores", link: "/store/events"},
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
          ],
        },
      ],
    },
    socialLinks: [{icon: "github", link: "https://github.com/vuejs/vitepress"}],
  },
})
