import { useEffect, useState } from 'react'
import { apiRequest } from '../lib/api'

export function useSmmNotes(monthKey) {
  const [key, setKey] = useState(monthKey)
  const [state, setState] = useState({ conclusions: [], loading: Boolean(monthKey), error: null })

  if (monthKey !== key) {
    setKey(monthKey)
    setState({ conclusions: [], loading: Boolean(monthKey), error: null })
  }

  useEffect(() => {
    if (!monthKey) return undefined

    let isMounted = true

    apiRequest(`/api/smm/notes?month=${encodeURIComponent(monthKey)}`)
      .then((data) => {
        if (!isMounted) return
        setState({ conclusions: data?.conclusions || [], loading: false, error: null })
      })
      .catch((error) => {
        if (!isMounted) return
        setState({ conclusions: [], loading: false, error })
      })

    return () => {
      isMounted = false
    }
  }, [monthKey])

  async function save(conclusions) {
    const saved = await apiRequest('/api/smm/notes', {
      method: 'PATCH',
      body: JSON.stringify({ month: monthKey, conclusions }),
    })
    setState({ conclusions: saved?.conclusions || [], loading: false, error: null })
    return saved
  }

  return { ...state, save }
}
