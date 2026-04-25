// 陳情案件 SLA：從建立日到現在的天數，對應顏色與標籤。
// 統一給 Dashboard / 列表 / 詳情 / 報表使用，避免顏色與閾值不同步。

export type SlaLevel = 'closed' | 'fresh' | 'warning' | 'critical' | 'overdue'

export interface SlaStatus {
  level: SlaLevel
  /** 表示用顏色（背景／點點圖示）*/
  color: string
  /** 對應 Ant Design Tag color */
  tag: string
  /** 中文文字標籤 */
  label: string
  /** 從建立到現在的天數（向下取整） */
  ageDays: number
}

const SLA_THRESHOLDS = {
  warning: 3,   // < 3 天：綠
  critical: 7,  // 3–7 天：黃
  overdue: 14,  // 7–14 天：橘；> 14 天：紅
} as const

/**
 * 判斷陳情的 SLA 狀態。
 * - 已結案 / 已取消：transparent / closed
 * - < 3 天：綠（fresh）
 * - 3–7 天：黃（warning）
 * - 7–14 天：橘（critical）
 * - > 14 天：紅（overdue）
 */
export function getPetitionSla(createdAt: string | undefined | null, status: string | undefined | null): SlaStatus {
  if (status === 'closed' || status === 'cancelled') {
    return { level: 'closed', color: 'transparent', tag: 'default', label: '已結案', ageDays: 0 }
  }
  if (!createdAt) {
    return { level: 'fresh', color: '#8c8c8c', tag: 'default', label: '未知', ageDays: 0 }
  }
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000)
  if (days < SLA_THRESHOLDS.warning) {
    return { level: 'fresh', color: '#52c41a', tag: 'green', label: '正常', ageDays: days }
  }
  if (days < SLA_THRESHOLDS.critical) {
    return { level: 'warning', color: '#faad14', tag: 'gold', label: '注意', ageDays: days }
  }
  if (days < SLA_THRESHOLDS.overdue) {
    return { level: 'critical', color: '#fa8c16', tag: 'orange', label: '緊急', ageDays: days }
  }
  return { level: 'overdue', color: '#ff4d4f', tag: 'red', label: `逾期 ${days} 天`, ageDays: days }
}

/** 與舊 PetitionListPage 的 getSLAColor() 行為相同，僅顏色字串。 */
export function getPetitionSlaColor(createdAt: string, status: string): string {
  return getPetitionSla(createdAt, status).color
}
