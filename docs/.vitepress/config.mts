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
        // items: [
        //   {text: "Introduction", link: "/feeds/introduction"},
        //   {text: "Feeds", link: "/feeds/feeds"},
        //   {text: "Feed types", link: "/feeds/feed-types"},
        //   {text: "Feed utilities", link: "/feeds/feed-utilities"},
        // ],
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
    ],

    socialLinks: [{icon: "github", link: "https://github.com/vuejs/vitepress"}],
  },
})
