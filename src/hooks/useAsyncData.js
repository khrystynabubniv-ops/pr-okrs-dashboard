import { useCallback, useEffect, useRef, useState } from 'react'

export function useAsyncData(loader, dependencies = [], options = {}) {
  const initialData =
    typeof options.initialData === 'function'
      ? options.initialData()
      : options.initialData
  const [data, setStateData] = useState(initialData ?? null)
  const [loading, setLoading] = useState(initialData === undefined || initialData === null)
  const [error, setError] = useState(null)
  const requestIdRef = useRef(0)
  const dataRef = useRef(initialData ?? null)

  function setData(nextData) {
    dataRef.current =
      typeof nextData === 'function' ? nextData(dataRef.current) : nextData
    setStateData(dataRef.current)
  }

  const load = useCallback(async () => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    const hasData = dataRef.current !== null && dataRef.current !== undefined

    setLoading(!options.backgroundRefresh || !hasData)
    setError(null)
    if (!options.keepPreviousData) setData(null)

    try {
      const result = await loader()
      if (requestId === requestIdRef.current) {
        setData(result)
      }
    } catch (loadError) {
      if (requestId === requestIdRef.current) {
        setError(loadError)
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false)
      }
    }
    // The caller owns the dependency list so page-level reloads stay explicit.
  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/use-memo
  }, dependencies)

  useEffect(() => {
    load()
  }, [load])

  return { data, loading, error, retry: load, setData }
}
