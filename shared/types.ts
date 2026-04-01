// 使用者角色
export type UserRole = 'admin' | 'supervisor' | 'assistant' | 'volunteer'

// 使用者
export interface User {
  id: number
  username: string
  name: string
  role: UserRole
  email?: string
  phone?: string
  is_active: number
  created_at: string
  updated_at: string
}

// 登入 Token
export interface AuthToken {
  token: string
  user: User
}

// 選民
export interface Voter {
  id: number
  name: string
  gender?: string
  birth_date?: string
  id_number?: string
  mobile?: string
  phone?: string
  line_id?: string
  email?: string
  household_city?: string
  household_district?: string
  household_village?: string
  household_neighbor?: string
  household_address?: string
  mailing_address?: string
  occupation?: string
  company?: string
  job_title?: string
  election_area?: string
  note?: string
  is_active: number
  created_by?: number
  created_at: string
  updated_at: string
  tags?: string[]
}

// 團體
export interface Group {
  id: number
  name: string
  category?: string
  leader_id?: number
  contact_id?: number
  phone?: string
  address?: string
  member_count?: number
  note?: string
  is_active: number
  created_at: string
  updated_at: string
}

// 陳情案件狀態
export type PetitionStatus = 'pending' | 'processing' | 'referred' | 'replied' | 'closed' | 'archived'
export type PetitionUrgency = 'normal' | 'urgent' | 'critical'
export type PetitionChannel = '電話' | '親訪' | '書信' | 'LINE' | '電子郵件' | '轉介' | '其他'

// 陳情案件
export interface Petition {
  id: number
  case_number: string
  petition_date: string
  voter_id?: number
  voter_name?: string
  channel?: string
  category?: string
  subcategory?: string
  content: string
  area_city?: string
  area_district?: string
  area_village?: string
  area_address?: string
  urgency: PetitionUrgency
  status: PetitionStatus
  assignee_id?: number
  assignee_name?: string
  satisfaction?: string
  closed_at?: string
  created_by?: number
  created_at: string
  updated_at: string
}

// 陳情處理紀錄
export interface PetitionLog {
  id: number
  petition_id: number
  action_type: string
  content: string
  referred_to?: string
  created_by?: number
  created_by_name?: string
  created_at: string
}

// 公文類型
export type DocType = 'incoming' | 'outgoing'
export type DocStatus = 'pending' | 'processing' | 'replied' | 'archived'

// 公文
export interface Document {
  id: number
  doc_number: string
  doc_type: DocType
  doc_date: string
  org_name?: string
  org_doc_number?: string
  org_doc_date?: string
  subject: string
  content_summary?: string
  category?: string
  assignee_id?: number
  assignee_name?: string
  status: DocStatus
  deadline?: string
  related_doc_id?: number
  related_petition_id?: number
  created_by?: number
  created_at: string
  updated_at: string
}

// 行程
export interface Schedule {
  id: number
  title: string
  start_time: string
  end_time?: string
  schedule_type?: string
  location?: string
  attendees?: string
  related_voter_ids?: string
  related_group_ids?: string
  related_petition_id?: number
  note?: string
  is_recurring: number
  recurrence_rule?: string
  status: string
  reminder_minutes: number
  created_by?: number
  created_at: string
  updated_at: string
}

// 操作紀錄
export interface AuditLog {
  id: number
  user_id: number
  user_name?: string
  action: string
  module: string
  target_type?: string
  target_id?: number
  target_name?: string
  detail?: string
  ip_address?: string
  created_at: string
}

// 分頁回應
export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
}

// API 通用回應
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  message?: string
  error?: string
}

// 類別
export interface Category {
  id: number
  type: string
  parent_id?: number
  name: string
  sort_order: number
  is_active: number
  children?: Category[]
}
