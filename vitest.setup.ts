import { beforeAll, vi } from 'vitest'

beforeAll(() => {
  vi.mock('@actions/core', async () => {
    const core = await import('@actions/core')

    return {
      ...core,
      startGroup: () => undefined,
      endGroup: () => undefined,
      debug: () => undefined,
      info: () => undefined,
      error: () => undefined,
      setFailed: () => undefined,
    } satisfies typeof core
  })
})
