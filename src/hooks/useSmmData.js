import { useEffect, useState } from 'react'
import { apiRequest } from '../lib/api'
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

      async function loadData() {
        if (normalizedPreviewState === 'mock') {
          setState({
            data: getSmmMonthData(month),
            loading: false,
            error: null,
          })
          return
        }

        const monthKey = monthToIsoMonth(month)

        try {
          const data = await apiRequest(
            `/api/smm/data?month=${encodeURIComponent(monthKey || month)}`,
          )
          if (!isMounted) return

          setState({
            data,
            loading: false,
            error: null,
          })
        } catch (requestError) {
          if (!isMounted) return

          const fallback = getSmmMonthData(month)
          setState({
            data: {
              ...fallback,
              source: 'Meta Business Suite · demo fallback',
              sourceMode: 'mock-fallback',
              integrationError: requestError.message,
            },
            loading: false,
            error: null,
          })
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

    return () => {
      isMounted = false
      window.clearTimeout(loadingTimeout)
      window.clearTimeout(timeout)
    }
  }, [month, previewState])

  return state
}
