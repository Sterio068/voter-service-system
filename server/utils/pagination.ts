export function parsePagination(query: any): { page: number; pageSize: number; offset: number } {
  const page = Math.max(1, Number(query.page) || 1)
  const pageSize = Math.min(100, Math.max(5, Number(query.pageSize) || 20))
  return { page, pageSize, offset: (page - 1) * pageSize }
}

export function paginatedResponse<T>(data: T[], total: number, page: number, pageSize: number) {
  return {
    success: true as const,
    data,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    }
  }
}
