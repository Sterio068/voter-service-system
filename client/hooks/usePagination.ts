import { useState } from 'react'
export function usePagination(initialPageSize = 20) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(initialPageSize)
  const reset = () => setPage(1)
  const onChange = (p: number, ps: number) => { setPage(p); setPageSize(ps) }
  return { page, pageSize, reset, onChange }
}
