import {describe, it, expect, beforeEach} from "vitest"
import {htmlRenderOptions, Renderer, textRenderOptions} from "../src"

describe("Renderer", () => {
  let renderer: Renderer

  describe("Html renderer", () => {
    beforeEach(() => {
      renderer = new Renderer(htmlRenderOptions)
    })

    it("should render text", () => {
      renderer.addText("Hello world")
      expect(renderer.toString()).toBe("Hello world")
    })

    it("should render newlines", () => {
      renderer.addNewlines(2)
      expect(renderer.toString()).toBe("\n\n")
    })

    it("should render links", () => {
      renderer.addLink("https://njump.me", "Example")
      expect(renderer.toString()).toBe('<a href="https://njump.me/" target="_blank">Example</a>')
    })

    it("should render entities", () => {
      renderer.addEntityLink("1234567890abcdef")
      expect(renderer.toString()).toBe(
        '<a href="https://njump.me/1234567890abcdef" target="_blank">1234567890abcdef…</a>',
      )
    })

    it("should escape HTML in text content", () => {
      renderer.addText('<script>alert("xss")</script>')
      expect(renderer.toString()).not.toContain("<script>")
    })
  })
  describe("Text renderer", () => {
    beforeEach(() => {
      renderer = new Renderer(textRenderOptions)
    })

    it("should render text", () => {
      renderer.addText("Hello world")
      expect(renderer.toString()).toBe("Hello world")
    })

    it("should render newlines", () => {
      renderer.addNewlines(2)
      expect(renderer.toString()).toBe("\n\n")
    })

    it("should render links", () => {
      renderer.addLink("https://njump.me", "Example")
      expect(renderer.toString()).toBe("https://njump.me")
    })

    it("should render entities", () => {
      renderer.addEntityLink("1234567890abcdef")
      expect(renderer.toString()).toBe("1234567890abcdef")
    })

    it("should escape HTML in text content", () => {
      renderer.addText('<script>alert("xss")</script>')
      expect(renderer.toString()).not.toContain("<script>")
    })
  })
})
