import { describe, expect, it, vi } from 'vitest'

import {
  createYunxiaoChangePoll,
  YUNXIAO_CHANGE_POLL_LIMIT,
  YUNXIAO_WATCHED_FILTERS
} from './yunxiao-work-item-change-poll'
import type { YunxiaoWorkItemFilter } from '../../../shared/yunxiao-types'

function deferred(): { promise: Promise<[]>; resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<[]>((settle) => {
    resolve = () => settle([])
  })
  return { promise, resolve }
}

describe('createYunxiaoChangePoll', () => {
  it('drops the cached lists before reading, so a tick cannot answer from cache', async () => {
    const order: string[] = []
    const poll = createYunxiaoChangePoll({
      invalidate: () => order.push('invalidate'),
      read: async (filter) => {
        order.push(`read:${filter}`)
        return []
      }
    })

    await poll()

    expect(order).toEqual(['invalidate', 'read:assigned', 'read:created'])
  })

  it('reads every watched list at the shared limit', async () => {
    const read = vi.fn(async () => [])
    const poll = createYunxiaoChangePoll({ invalidate: () => {}, read })

    await poll()

    expect(read.mock.calls).toEqual(
      YUNXIAO_WATCHED_FILTERS.map((filter) => [filter, YUNXIAO_CHANGE_POLL_LIMIT])
    )
  })

  it('coalesces a tick that fires while the previous read is still running', async () => {
    const pending = deferred()
    const read = vi.fn(() => pending.promise)
    const invalidate = vi.fn()
    const poll = createYunxiaoChangePoll({ invalidate, read })

    const first = poll()
    const second = poll()

    expect(second).toBe(first)
    expect(invalidate).toHaveBeenCalledTimes(1)
    // Reads are sequential, so only the first watched list is in flight here.
    expect(read).toHaveBeenCalledTimes(1)

    pending.resolve()
    await first
  })

  it('runs again once the in-flight read settles', async () => {
    const read = vi.fn(async () => [])
    const poll = createYunxiaoChangePoll({ invalidate: () => {}, read })

    await poll()
    await poll()

    expect(read).toHaveBeenCalledTimes(YUNXIAO_WATCHED_FILTERS.length * 2)
  })

  it('survives a failing read and still polls on the next tick', async () => {
    const read = vi
      .fn<(filter: YunxiaoWorkItemFilter, limit: number) => Promise<[]>>()
      .mockRejectedValueOnce(new Error('云效 unreachable'))
      .mockResolvedValue([])
    const poll = createYunxiaoChangePoll({ invalidate: () => {}, read })

    await expect(poll()).resolves.toBeUndefined()
    await expect(poll()).resolves.toBeUndefined()

    expect(read).toHaveBeenCalledTimes(YUNXIAO_WATCHED_FILTERS.length * 2)
  })
})
