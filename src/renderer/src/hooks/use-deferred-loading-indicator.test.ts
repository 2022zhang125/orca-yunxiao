/** @vitest-environment happy-dom */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDeferredLoadingIndicator } from './use-deferred-loading-indicator'

describe('useDeferredLoadingIndicator', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('stays hidden for a response that lands inside the delay', () => {
    const { result, rerender } = renderHook(({ loading }) => useDeferredLoadingIndicator(loading), {
      initialProps: { loading: true }
    })

    act(() => {
      vi.advanceTimersByTime(150)
    })
    expect(result.current).toBe(false)

    rerender({ loading: false })
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(result.current).toBe(false)
  })

  it('shows once the response outlasts the delay, and hides again on settle', () => {
    const { result, rerender } = renderHook(({ loading }) => useDeferredLoadingIndicator(loading), {
      initialProps: { loading: true }
    })

    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(result.current).toBe(true)

    rerender({ loading: false })
    expect(result.current).toBe(false)
  })

  it('restarts the delay for each new load rather than latching on', () => {
    const { result, rerender } = renderHook(({ loading }) => useDeferredLoadingIndicator(loading), {
      initialProps: { loading: true }
    })

    act(() => {
      vi.advanceTimersByTime(200)
    })
    rerender({ loading: false })
    rerender({ loading: true })
    expect(result.current).toBe(false)

    act(() => {
      vi.advanceTimersByTime(199)
    })
    expect(result.current).toBe(false)

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current).toBe(true)
  })
})
