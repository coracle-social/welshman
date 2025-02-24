import {defineConfig} from "vitepress"

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Welshman",
  description: "The official Welshman documentation",
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      {text: "Home", link: "/"},
      {text: "Guide", link: "/markdown-examples"},
    ],

    sidebar: [
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
          {text: "Context", link: "/app/context"},
          {text: "Storage", link: "/app/storage"},
          {text: "Router", link: "/app/router"},
          {text: "Session", link: "/app/session"},
          {text: "Collection", link: "/app/collection"},
          {text: "Commands", link: "/app/commands"},
          {text: "Subscription", link: "/app/subscription"},
          {text: "Publish (Thunks)", link: "/app/thunks"},
          {text: "Feed", link: "/app/feed"},
          {text: "Tag utilities", link: "/app/tags"},
          {text: "Topics", link: "/app/topics"},
          {text: "Web of Trust", link: "/app/wot"},
        ],
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
        text: "@welshman/content",
        link: "/content/",
        items: [
          {text: "Parser", link: "/content/parser"},
          {text: "Renderer", link: "/content/renderer"},
        ],
      },
      {
        text: "@welshman/signer",
        link: "/signer/",
        items: [
          {text: "NIP-01", link: "/signer/nip-01"},
          {text: "NIP-07", link: "/signer/nip-07"},
          {text: "NIP-46", link: "/signer/nip-46"},
          {text: "NIP-55", link: "/signer/nip-55"},
          {text: "NIP-59", link: "/signer/nip-59"},
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
        text: "@welshman/dvm",
        link: "/dvm/",
        items: [
          {text: "Handler", link: "/dvm/handler"},
          {text: "Request", link: "/dvm/request"},
        ],
      },
      {
        text: "@welshman/editor",
        link: "/editor/",
        items: [],
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
        text: "@welshman/lib",
        link: "/lib/",
        items: [
          {text: "Utilities", link: "/lib/tools"},
          {text: "LRU cache", link: "/lib/lru"},
          {text: "Worker", link: "/lib/worker"},
          {text: "Deferred", link: "/lib/deferred"},
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
        ],
      },
    ],

    socialLinks: [{icon: "github", link: "https://github.com/vuejs/vitepress"}],
  },
})
