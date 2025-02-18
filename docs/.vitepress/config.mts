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
          {text: "Tag utilities", link: "/app/tags"},
          {text: "Topics", link: "/app/topics"},
          {text: "Web of Trust", link: "/app/wot"},
        ],
      },
    ],

    socialLinks: [{icon: "github", link: "https://github.com/vuejs/vitepress"}],
  },
})
