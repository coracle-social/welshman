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
          {text: "What is Welshman", link: "/markdown-examples"},
          {text: "Getting started", link: "/api-examples"},
        ],
      },
      {
        text: "Packages",
        items: [
          {text: "Signer", link: "/markdown-examples"},
          {text: "App", link: "/markdown-examples"},
          {text: "Feeds", link: "/api-examples"},
          {text: "Net", link: "/api-examples"},
          {text: "Content", link: "/api-examples"},
          {text: "Editor", link: "/api-examples"},
          {text: "DVM", link: "/markdown-examples"},
          {text: "Lib", link: "/markdown-examples"},
          {text: "Store", link: "/api-examples"},
          {text: "util", link: "/markdown-examples"},
        ],
      },
    ],

    socialLinks: [{icon: "github", link: "https://github.com/vuejs/vitepress"}],
  },
})
