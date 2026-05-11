import { useCallback, useEffect, useState } from 'react'

export function useAsyncData(loader, dependencies = []) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const result = await loader()
      setData(result)
    } catch (loadError) {
      setError(loadError)
    } finally {
      setLoading(false)
    }
    // The caller owns the dependency list so page-level reloads stay explicit.
  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/use-memo
  }, dependencies)

  useEffect(() => {
    load()
  }, [load])

  return { data, loading, error, retry: load, setData }
}
