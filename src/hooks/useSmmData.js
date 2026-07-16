import { useEffect, useState } from 'react'
import { getSmmMonthData } from '../lib/smmData'

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

      try {
        setState({
          data: getSmmMonthData(month),
          loading: false,
          error: null,
        })
      } catch (error) {
        setState({ data: null, loading: false, error })
      }
    }, 520)

    return () => {
      isMounted = false
      window.clearTimeout(loadingTimeout)
      window.clearTimeout(timeout)
    }
  }, [month, previewState])

  return state
}
