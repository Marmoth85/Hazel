import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'

export function useInvalidateAll() {
  const qc = useQueryClient()
  return useCallback(async () => {
    await qc.invalidateQueries()
    await qc.refetchQueries({ type: 'active' })
  }, [qc])
}
