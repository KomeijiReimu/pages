import type { Mutex } from "async-mutex"

export async function withMutex<T>(mutex: Pick<Mutex, "acquire">, action: () => Promise<T>) {
  const release = await mutex.acquire()
  try {
    return await action()
  } finally {
    release()
  }
}
