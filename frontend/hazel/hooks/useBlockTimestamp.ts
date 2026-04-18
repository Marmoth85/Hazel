import { useBlock } from 'wagmi'

export function useBlockTimestamp(): number | undefined {
  const { data } = useBlock({ watch: true })
  return data?.timestamp !== undefined ? Number(data.timestamp) : undefined
}
