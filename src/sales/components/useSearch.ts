import { useCallback, useEffect, useRef, useState } from 'react'

export type SearchState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; value: T }
  | { status: 'error'; error: unknown }

// One explicit lookup at a time: a new search or an unmount cancels the one in flight,
// and an answer that was superseded is never shown.
export function useSearch<T>(run: (term: string, signal: AbortSignal) => Promise<T>) {
  const [state, setState] = useState<SearchState<T>>({ status: 'idle' })
  const controller = useRef<AbortController | null>(null)
  const runner = useRef(run)
  useEffect(() => { runner.current = run })
  useEffect(() => () => controller.current?.abort(), [])

  const search = useCallback((term: string) => {
    controller.current?.abort()
    const current = new AbortController()
    controller.current = current
    setState({ status: 'loading' })
    runner.current(term, current.signal).then(
      (value) => { if (!current.signal.aborted) setState({ status: 'ready', value }) },
      (error: unknown) => { if (!current.signal.aborted) setState({ status: 'error', error }) },
    )
  }, [])
  return { state, search }
}
