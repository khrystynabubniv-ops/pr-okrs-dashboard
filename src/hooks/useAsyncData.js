import { useCallback, useEffect, useRef, useState } from 'react'

export function useAsyncData(loader, dependencies = []) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const requestIdRef = useRef(0)

  const load = useCallback(async () => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    setLoading(true)
    setError(null)
    setData(null)

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
