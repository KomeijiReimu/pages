import assert from "node:assert/strict"
import test from "node:test"
import { isLoopbackHost } from "./handlers.js"

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
