import { useEffect, useState } from 'react'
import { API_REFRESH_INTERVAL_MS, apiRequest } from '../lib/api'
import { getSmmMonthData, monthToIsoMonth } from '../lib/smmData'

export function useSmmData(month, previewState = '') {
  const [state, setState] = useState({
    data: null,
    loading: true,
    error: null,
  })

  useEffect(() => {
    let isMounted = true
    const normalizedPreviewState = String(previewState || '').toLowerCase()

    const loadingTimeout = window.setTimeout(() => {
      if (isMounted) {
        setState((current) => ({ ...current, loading: true, error: null }))
      }
    }, 0)

    if (normalizedPreviewState === 'loading') {
      return () => {
        isMounted = false
        window.clearTimeout(loadingTimeout)
      }
    }

    const timeout = window.setTimeout(() => {
      if (!isMounted) return

      if (normalizedPreviewState === 'empty') {
        setState({ data: null, loading: false, error: null })
        return
      }

      async function loadData(options = {}) {
        if (normalizedPreviewState === 'mock') {
          setState({
            data: getSmmMonthData(month),
            loading: false,
            error: null,
          })
          return
        }

        const monthKey = monthToIsoMonth(month)
        const controller = new AbortController()
        const requestTimeout = window.setTimeout(() => controller.abort(), 35000)

        try {
          const data = await apiRequest(
            `/api/smm/data?month=${encodeURIComponent(monthKey || month)}`,
            {
              signal: controller.signal,
              forceRefresh: Boolean(options.background),
            },
          )
          if (!isMounted) return

          setState({
            data,
            loading: false,
            error: null,
          })
        } catch (requestError) {
          if (!isMounted) return
          if (options.background) return

          const message =
            requestError.name === 'AbortError'
              ? 'Meta API відповідає задовго. Спробуйте оновити сторінку за кілька секунд.'
              : requestError.message
          setState({
            data: null,
            loading: false,
            error: new Error(message),
          })
        } finally {
          window.clearTimeout(requestTimeout)
        }
      }

      try {
        void loadData()
      } catch (error) {
        setState({
          data: null,
          loading: false,
          error,
        })
      }
    }, 320)
    const interval = window.setInterval(() => {
      if (!['', 'data'].includes(normalizedPreviewState)) return
      const monthKey = monthToIsoMonth(month)
      const controller = new AbortController()
      const requestTimeout = window.setTimeout(() => controller.abort(), 35000)

      apiRequest(`/api/smm/data?month=${encodeURIComponent(monthKey || month)}`, {
        signal: controller.signal,
        forceRefresh: true,
      })
        .then((data) => {
          if (!isMounted) return
          setState({ data, loading: false, error: null })
        })
        .catch(() => {})
        .finally(() => {
          window.clearTimeout(requestTimeout)
        })
    }, API_REFRESH_INTERVAL_MS)

    return () => {
      isMounted = false
      window.clearTimeout(loadingTimeout)
      window.clearTimeout(timeout)
      window.clearInterval(interval)
    }
  }, [month, previewState])

  return state
}
