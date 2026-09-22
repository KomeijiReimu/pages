import assert from "node:assert/strict"
import test from "node:test"
import { isLoopbackHost, shouldIncludeGitignoredForLocalServe } from "./handlers.js"

test("include preview loopback host validation", () => {
  assert.equal(isLoopbackHost("localhost"), true)
  assert.equal(isLoopbackHost("127.0.0.1"), true)
  assert.equal(isLoopbackHost("127.20.30.40"), true)
  assert.equal(isLoopbackHost("::1"), true)
  assert.equal(isLoopbackHost("0:0:0:0:0:0:0:1"), true)
  assert.equal(isLoopbackHost("::ffff:127.0.0.1"), true)

  assert.equal(isLoopbackHost("0.0.0.0"), false)
  assert.equal(isLoopbackHost("::"), false)
  assert.equal(isLoopbackHost("192.168.1.10"), false)
  assert.equal(isLoopbackHost("example.com"), false)
})

test("local loopback serve includes Git-ignored content", () => {
  assert.equal(shouldIncludeGitignoredForLocalServe({ serve: true, host: "localhost" }), true)
  assert.equal(shouldIncludeGitignoredForLocalServe({ serve: true, host: "127.0.0.1" }), true)
  assert.equal(shouldIncludeGitignoredForLocalServe({ serve: false, host: "localhost" }), false)
  assert.equal(shouldIncludeGitignoredForLocalServe({ serve: true, host: "0.0.0.0" }), false)
  assert.equal(shouldIncludeGitignoredForLocalServe({ host: "localhost" }), false)
})
