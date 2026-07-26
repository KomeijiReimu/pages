import assert from "node:assert/strict"
import test from "node:test"
import { Mutex } from "async-mutex"
import { withMutex } from "./mutex"

test("withMutex releases the lock when a rebuild fails", { timeout: 1000 }, async () => {
  const mutex = new Mutex()
  await assert.rejects(
    withMutex(mutex, async () => {
      throw new Error("synthetic rebuild failure")
    }),
    /synthetic rebuild failure/,
  )

  const result = await withMutex(mutex, async () => "next rebuild")
  assert.equal(result, "next rebuild")
})
