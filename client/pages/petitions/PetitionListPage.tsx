import React, { useState, useEffect, useRef } from 'react'
import {
  Table, Button, Space, Input, Select, Tag, Typography, Card, List,
  Drawer, Form, DatePicker, message, Popconfirm, Row, Col, Modal, Upload, Alert, AutoComplete, Radio
} from 'antd'
import { PlusOutlined, SearchOutlined, EyeOutlined, DownloadOutlined, FilterOutlined, EditOutlined, DeleteOutlined, UploadOutlined, SwapOutlined, CheckCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import api from '../../utils/api'
import { useAuthStore } from '../../stores/authStore'
import { useDataSync } from '../../hooks/useDataSync'
import { useIsMobile } from '../../components/Layout/MainLayout'
import PageScaffold from '../../components/ui/PageScaffold'
import WorkspaceToolbar from '../../components/ui/WorkspaceToolbar'
import EmptyState from '../../components/ui/EmptyState'
import FormFooter from '../../components/ui/FormFooter'
import SelectionActionBar from '../../components/ui/SelectionActionBar'
import FormSection from '../../components/ui/FormSection'
import SavedFiltersBar from '../../components/SavedFiltersBar'
import ManagedCategoryField, { CategoryManageButton } from '../../components/ManagedCategoryField'
import dayjs from 'dayjs'
import type { ColumnsType } from 'antd/es/table'
import { hasModulePermission } from '../../utils/permissions'
// SLA 顏色判斷已抽到 client/utils/petitionSla.ts
import { getPetitionSlaColor as getSLAColor } from '../../utils/petitionSla'

const { Text } = Typography
const { Option } = Select
const { TextArea } = Input

const STATUS_COLORS: Record<string, string> = {
  pending: 'orange',
  processing: 'blue',
  waiting_external: 'purple',
  waiting_applicant: 'cyan',
  replied: 'green',
  closed: 'default',
  cancelled: 'red',
}
const STATUS_LABELS: Record<string, string> = {
  pending: '待處理',
  processing: '處理中',
  waiting_external: '待外部回覆',
  waiting_applicant: '待民眾補件',
  replied: '已回覆',
  closed: '已結案',
  cancelled: '已取消',
}
const URGENCY_COLORS: Record<string, string> = { normal: 'default', urgent: 'orange', critical: 'red' }
const URGENCY_LABELS: Record<string, string> = { normal: '一般', urgent: '急件', critical: '特急' }

// 提取為模組層級常數避免每次 render 重建，防止 Antd Form 意外 re-init
const QUICK_FORM_INITIAL = { channel: '電話' }

export default function PetitionListPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { user } = useAuthStore()
  const isMobile = useIsMobile()
  const canCreatePetition = hasModulePermission(user?.role, 'petitions', 'create')
  const canEditPetition = hasModulePermission(user?.role, 'petitions', 'edit')
  const canDeletePetition = hasModulePermission(user?.role, 'petitions', 'delete')
  const canExportPetition = hasModulePermission(user?.role, 'petitions', 'export')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([])
  const [batchLoading, setBatchLoading] = useState(false)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<any>(null)
  const [data, setData] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  // Restore filters from sessionStorage (URL param takes precedence for status)
  const _savedFilters = (() => {
    try {
      const raw = sessionStorage.getItem('petition_filters')
      if (!raw) return {}
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch { return {} }
  })()
  const [filterStatus, setFilterStatus] = useState(searchParams.get('status') || _savedFilters.filterStatus || '')
  const [filterCategory, setFilterCategory] = useState(_savedFilters.filterCategory || '')
  const [filterUrgency, setFilterUrgency] = useState(_savedFilters.filterUrgency || '')
  const [search, setSearch] = useState(_savedFilters.search || '')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [form] = Form.useForm()
  const [categories, setCategories] = useState<string[]>([])
  const [areas, setAreas] = useState<string[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [voterSearch, setVoterSearch] = useState('')
  const [voterOptions, setVoterOptions] = useState<any[]>([])
  const [quickOpen, setQuickOpen] = useState(false)
  const [quickForm] = Form.useForm()
  const [inlineVoterOpen, setInlineVoterOpen] = useState(false)
  const [inlineVoterForm] = Form.useForm()
  const [voters, setVoters] = useState<any[]>([])
  const [startDate, setStartDate] = useState(_savedFilters.startDate || '')
  const [endDate, setEndDate] = useState(_savedFilters.endDate || '')
  const [editingPetitionId, setEditingPetitionId] = useState<number | null>(null)

  // 批次操作 Modal
  const [batchAssigneeOpen, setBatchAssigneeOpen] = useState(false)
  const [batchAssigneeId, setBatchAssigneeId] = useState<number | null>(null)
  const [batchUrgencyOpen, setBatchUrgencyOpen] = useState(false)
  const [batchUrgency, setBatchUrgency] = useState<'normal' | 'urgent' | 'critical'>('normal')

  useEffect(() => {
    fetchCategories()
    fetchAreas()
    fetchUsers()
  }, [])

  // URL action 變化時正確反映（支援外部導航、瀏覽器返回）
  useEffect(() => {
    if (new URLSearchParams(location.search).get('action') === 'new' && canCreatePetition) {
      setDrawerOpen(true)
    }
  }, [location.search, canCreatePetition])

  useEffect(() => {
    fetchPetitions()
  }, [page, pageSize, filterStatus, filterCategory, filterUrgency, search, startDate, endDate])

  useDataSync((events) => {
    const hasPetitionChange = events.some(e => e.target_type === 'petition')
    if (hasPetitionChange) fetchPetitions()
  }, [])

  useEffect(() => {
    sessionStorage.setItem('petition_filters', JSON.stringify({ filterStatus, filterCategory, filterUrgency, search, startDate, endDate }))
  }, [filterStatus, filterCategory, filterUrgency, search, startDate, endDate])

  const fetchCategories = async () => {
    try {
      const res = await api.get('/admin/categories?type=petition_category')
      setCategories(res.data.data?.map((c: any) => c.name) || [])
    } catch {}
  }

  const fetchAreas = async () => {
    try {
      const res = await api.get('/admin/categories?type=petition_area')
      setAreas(res.data.data?.map((c: any) => c.name) || [])
    } catch {}
  }

  const fetchUsers = async () => {
    try {
      const res = await api.get('/users/list')
      setUsers(res.data.data || [])
    } catch {}
  }

  const fetchPetitions = async () => {
    if (startDate && endDate && startDate > endDate) {
      message.warning('開始日期不可晚於結束日期')
      return
    }
    setLoading(true)
    try {
      const params: any = { page, pageSize }
      if (filterStatus) params.status = filterStatus
      if (filterCategory) params.category = filterCategory
      if (filterUrgency) params.urgency = filterUrgency
      if (search) params.search = search
      if (startDate) params.start_date = startDate
      if (endDate) params.end_date = endDate
      const res = await api.get('/petitions', { params })
      setData(res.data.data || [])
      setTotal(res.data.total || 0)
    } catch {
      message.error('載入陳情資料失敗')
    } finally {
      setLoading(false)
    }
  }

  const searchVoterTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchVoters = (q: string) => {
    if (searchVoterTimer.current) clearTimeout(searchVoterTimer.current)
    if (!q) return
    searchVoterTimer.current = setTimeout(async () => {
      try {
        const res = await api.get(`/voters/search?q=${encodeURIComponent(q)}`)
        setVoterOptions(res.data.data || [])
      } catch {}
    }, 300)
  }

  const fillContactFromVoter = (targetForm: typeof form | typeof quickForm, voterId?: number) => {
    if (!voterId) return
    const selected = voterOptions.find((v: any) => Number(v.id) === Number(voterId))
    if (!selected) return
    const nextValues: Record<string, string> = {}
    if (!targetForm.getFieldValue('contact_name')) nextValues.contact_name = selected.name
    if (!targetForm.getFieldValue('contact_phone')) nextValues.contact_phone = selected.mobile || selected.phone || ''
    if (Object.keys(nextValues).length > 0) targetForm.setFieldsValue(nextValues)
  }

  // 共用批次更新呼叫 — 走單一 transaction 端點 /petitions/bulk-update
  const callBulkUpdate = async (
    payload: { status?: string; assignee_id?: number | null; urgency?: 'normal' | 'urgent' | 'critical' },
    successDescription: string,
  ) => {
    if (selectedRowKeys.length === 0) return
    setBatchLoading(true)
    try {
      const res = await api.post('/petitions/bulk-update', {
        petition_ids: selectedRowKeys,
        ...payload,
      })
      const updated = Number(res.data?.updated ?? 0)
      const failed = Number(res.data?.failed ?? 0)
      const missing: number[] = res.data?.missing_ids || []
      if (failed === 0) {
        message.success(`${successDescription}：成功 ${updated} 筆`)
      } else if (updated > 0) {
        message.warning(`${successDescription}：成功 ${updated} 筆、失敗 ${failed} 筆${missing.length ? `（缺案 ID：${missing.slice(0, 5).join(',')}${missing.length > 5 ? '…' : ''}）` : ''}`)
      } else {
        message.error(`${successDescription}全部失敗（共 ${failed} 筆）`)
      }
      setSelectedRowKeys([])
      fetchPetitions()
    } catch (err: any) {
      message.error(err.response?.data?.error || '批次更新失敗')
    } finally {
      setBatchLoading(false)
    }
  }

  const handleBatchStatusChange = (status: string) =>
    callBulkUpdate({ status }, `批次更新狀態為「${STATUS_LABELS[status] || status}」`)

  const handleBatchAssignee = async () => {
    if (!batchAssigneeId) { message.warning('請選擇承辦人'); return }
    await callBulkUpdate({ assignee_id: batchAssigneeId }, '批次轉派')
    setBatchAssigneeOpen(false)
    setBatchAssigneeId(null)
  }

  const handleBatchUrgency = async () => {
    await callBulkUpdate({ urgency: batchUrgency }, `批次設定優先級為「${URGENCY_LABELS[batchUrgency]}」`)
    setBatchUrgencyOpen(false)
  }

  const handleBatchClose = () => {
    Modal.confirm({
      title: `確定批次結案 ${selectedRowKeys.length} 筆陳情案件？`,
      content: '結案後仍可重新開啟，但會記錄結案時間。',
      okText: '確定結案',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => callBulkUpdate({ status: 'closed' }, '批次結案'),
    })
  }

  const handleDownloadTemplate = async () => {
    try {
      const res = await api.get('/petitions/import/template', { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = 'petition_import_template.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    } catch { message.error('下載範本失敗') }
  }

  const handleImportFile = async (file: File) => {
    setImporting(true)
    setImportResult(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await api.post('/petitions/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      setImportResult(res.data)
      if (res.data.imported > 0) fetchPetitions()
    } catch { message.error('匯入失敗') }
    finally { setImporting(false) }
    return false
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const params: any = {}
      if (filterStatus) params.status = filterStatus
      if (filterCategory) params.category = filterCategory
      if (filterUrgency) params.urgency = filterUrgency
      if (search) params.search = search
      const res = await api.get('/petitions/export', { params, responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `petitions_${dayjs().format('YYYYMMDD')}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      message.success('匯出成功')
    } catch {
      message.error('匯出失敗')
    } finally {
      setExporting(false)
    }
  }

  const handleSave = async (values: any) => {
    if (submitting) return
    setSubmitting(true)
    try {
      // 過濾 null/空字串，避免 Zod 驗證失敗
      const cleaned: Record<string, any> = {}
      for (const [k, v] of Object.entries(values)) {
        if (v !== null && v !== undefined && v !== '') cleaned[k] = v
      }
      const payload = {
        ...cleaned,
        petition_date: values.petition_date ? dayjs(values.petition_date).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
      }
      await api.post('/petitions', payload)
      message.success('陳情案件已建立')
      setDrawerOpen(false)
      form.resetFields()
      fetchPetitions()
    } catch (err: any) {
      message.error(err.response?.data?.error || '建立失敗')
    } finally {
      setSubmitting(false)
    }
  }

  const handleInlineVoterCreate = async (vals: any) => {
    try {
      const res = await api.post('/voters', { name: vals.name, mobile: vals.mobile })
      const newId = res.data.data.id
      const vRes = await api.get('/voters?pageSize=500')
      setVoters(vRes.data.data || [])
      quickForm.setFieldValue('voter_id', newId)
      setInlineVoterOpen(false)
      inlineVoterForm.resetFields()
      message.success('選民已新增')
    } catch { message.error('新增失敗') }
  }

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/petitions/${id}`)
      message.success('陳情案件已刪除')
      fetchPetitions()
      setDrawerOpen(false)
    } catch (err: any) {
      message.error(err.response?.data?.error || '刪除失敗')
    }
  }

  const handleQuickCreate = async (values: any) => {
    if (submitting) return
    setSubmitting(true)
    try {
      // 過濾掉 null 值，避免 Zod 驗證失敗（後端預期 undefined，不接受 null）
      const cleaned: Record<string, any> = {}
      for (const [k, v] of Object.entries(values)) {
        if (v !== null && v !== undefined && v !== '') cleaned[k] = v
      }
      await api.post('/petitions', {
        ...cleaned,
        petition_date: dayjs().format('YYYY-MM-DD'),
        status: 'pending',
        urgency: 'normal',
      })
      message.success('案件已快速立案')
      setQuickOpen(false); quickForm.resetFields(); fetchPetitions()
    } catch (err: any) {
      message.error(err.response?.data?.error || '立案失敗')
    } finally { setSubmitting(false) }
  }

  const columns: ColumnsType<any> = [
    {
      title: '案件編號',
      dataIndex: 'case_number',
      width: 130,
      render: (n, r) => (
        <Space size={4}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: getSLAColor(r.created_at, r.status), display: 'inline-block', flexShrink: 0 }} />
          <Button type="link" style={{ padding: 0 }} onClick={() => navigate(`/petitions/${r.id}`)}>{n}</Button>
        </Space>
      ),
    },
    {
      title: '緊急程度',
      dataIndex: 'urgency',
      width: 80,
      render: (u) => <Tag color={URGENCY_COLORS[u]}>{URGENCY_LABELS[u]}</Tag>,
    },
    {
      title: '狀態',
      dataIndex: 'status',
      width: 90,
      render: (s) => <Tag color={STATUS_COLORS[s]}>{STATUS_LABELS[s]}</Tag>,
    },
    { title: '陳情人', dataIndex: 'voter_name', width: 90 },
    { title: '類別', dataIndex: 'category', width: 100 },
    {
      title: '陳情內容',
      dataIndex: 'content',
      ellipsis: true,
      render: (c) => <Text ellipsis style={{ maxWidth: 250 }}>{c}</Text>,
    },
    {
      title: '承辦人',
      dataIndex: 'assignee_name',
      width: 110,
      render: (v: string, row: any) => {
        if (canEditPetition && editingPetitionId === row.id) return (
          <Select
            size="small"
            defaultValue={row.assignee_id}
            style={{ width: 90 }}
            autoFocus
            onBlur={() => setEditingPetitionId(null)}
            onChange={async (newId: number) => {
              try {
                await api.put(`/petitions/${row.id}`, { assignee_id: newId })
                fetchPetitions()
              } catch { message.error('更新失敗') }
              setEditingPetitionId(null)
            }}
          >
            {users.map(u => <Select.Option key={u.id} value={u.id}>{u.name}</Select.Option>)}
          </Select>
        )
        return (
          <span
            role={canEditPetition ? 'button' : undefined}
            tabIndex={canEditPetition ? 0 : undefined}
            aria-label={canEditPetition ? `編輯承辦人 ${v || '未指派'}` : undefined}
            style={{ cursor: canEditPetition ? 'pointer' : 'default' }}
            onClick={() => { if (canEditPetition) setEditingPetitionId(row.id) }}
            onKeyDown={(e) => { if (canEditPetition && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setEditingPetitionId(row.id) } }}
          >
            {v || '—'} {canEditPetition ? <EditOutlined style={{ fontSize: 11, color: '#999' }} aria-hidden /> : null}
          </span>
        )
      },
    },
    {
      title: '陳情日期',
      dataIndex: 'petition_date',
      width: 100,
      render: (d) => dayjs(d).format('YYYY-MM-DD'),
    },
    {
      title: '操作',
      width: 120,
      render: (_, r) => {
        const caseLabel = r.case_number || `案件 ${r.id}`
        return (
          <Space size={4}>
            <Button
              size="small"
              icon={<EyeOutlined />}
              aria-label={`查看陳情 ${caseLabel}`}
              onClick={() => navigate(`/petitions/${r.id}`)}
            />
            {canDeletePetition && (
              <Popconfirm
                title="確定刪除此陳情案件？"
                description="刪除後將無法復原。"
                okText="確定刪除"
                cancelText="取消"
                okButtonProps={{ danger: true }}
                onConfirm={() => handleDelete(r.id)}
              >
                <Button size="small" danger icon={<DeleteOutlined />} aria-label={`刪除陳情 ${caseLabel}`} />
              </Popconfirm>
            )}
          </Space>
        )
      },
    },
  ]

  return (
    <PageScaffold
      eyebrow="Case Service"
      title="陳情管理"
      titleLevel={4}
      variant="compact"
      description="追蹤立案、承辦、SLA 與回覆進度，讓服務案件不中斷。"
      actions={
        <>
          {canExportPetition && (
            <>
              <Button icon={<DownloadOutlined />} onClick={handleExport} loading={exporting}>匯出 Excel</Button>
            </>
          )}
          {canCreatePetition && (
            <>
              <Button icon={<UploadOutlined />} onClick={() => { setImportResult(null); setImportModalOpen(true) }}>批量匯入</Button>
              <Button onClick={() => { quickForm.resetFields(); setQuickOpen(true) }}>快速立案</Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setDrawerOpen(true) }}>
                新增陳情
              </Button>
            </>
          )}
        </>
      }
    >

      <WorkspaceToolbar
        title="案件篩選"
        description="用快選日期、狀態、類別與緊急程度定位待處理案件。"
        meta={<Text type="secondary">共 {total} 筆</Text>}
      >
        <div style={{ marginBottom: 8 }}>
          <SavedFiltersBar
            scope="petition"
            currentFilters={{ search, filterStatus, filterCategory, filterUrgency, startDate, endDate }}
            onApply={(f) => {
              setSearch(typeof f.search === 'string' ? f.search : '')
              setFilterStatus(typeof f.filterStatus === 'string' ? f.filterStatus : '')
              setFilterCategory(typeof f.filterCategory === 'string' ? f.filterCategory : '')
              setFilterUrgency(typeof f.filterUrgency === 'string' ? f.filterUrgency : '')
              setStartDate(typeof f.startDate === 'string' ? f.startDate : '')
              setEndDate(typeof f.endDate === 'string' ? f.endDate : '')
              setPage(1)
            }}
          />
        </div>
        <Space size={4} style={{ marginBottom: 8 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>快選：</Text>
          {[
            { label: '本月', start: dayjs().startOf('month').format('YYYY-MM-DD'), end: dayjs().endOf('month').format('YYYY-MM-DD') },
            { label: '上月', start: dayjs().subtract(1, 'month').startOf('month').format('YYYY-MM-DD'), end: dayjs().subtract(1, 'month').endOf('month').format('YYYY-MM-DD') },
            { label: '本季', start: (() => { const m = dayjs().month(); const qStart = Math.floor(m / 3) * 3; return dayjs().month(qStart).startOf('month').format('YYYY-MM-DD') })(), end: (() => { const m = dayjs().month(); const qEnd = Math.floor(m / 3) * 3 + 2; return dayjs().month(qEnd).endOf('month').format('YYYY-MM-DD') })() },
            { label: '今年', start: dayjs().startOf('year').format('YYYY-MM-DD'), end: dayjs().endOf('year').format('YYYY-MM-DD') },
          ].map(opt => (
            <Button key={opt.label} size="small" onClick={() => { setStartDate(opt.start); setEndDate(opt.end); setPage(1) }}>
              {opt.label}
            </Button>
          ))}
          {(startDate || endDate) && <Button size="small" onClick={() => { setStartDate(''); setEndDate(''); setPage(1) }}>清除</Button>}
        </Space>
        <Space wrap role="search" aria-label="陳情案件篩選">
          <Input.Search
            placeholder="搜尋陳情內容"
            // 簡化 aria-label，避免和表單「陳情內容」textarea 在 Playwright
            // getByLabel 命中重複；placeholder 已交代搜尋對象。
            aria-label="搜尋陳情"
            allowClear
            style={{ width: 200 }}
            value={search}
            onChange={(e) => { if (!e.target.value) { setSearch(''); setPage(1) } }}
            onSearch={(v) => { setSearch(v); setPage(1) }}
            prefix={<SearchOutlined aria-hidden />}
          />
          <Select placeholder="狀態篩選" aria-label="狀態篩選" allowClear style={{ width: 110 }} onChange={(v) => { setFilterStatus(v || ''); setPage(1) }} value={filterStatus || undefined}>
            {Object.entries(STATUS_LABELS).map(([v, l]) => <Option key={v} value={v}>{l}</Option>)}
          </Select>
          <Space.Compact>
            <Select placeholder="類別篩選" aria-label="類別篩選" allowClear style={{ width: 120 }} onChange={(v) => { setFilterCategory(v || ''); setPage(1) }} value={filterCategory || undefined}>
              {categories.map(c => <Option key={c} value={c}>{c}</Option>)}
            </Select>
            <CategoryManageButton tab="petition_category" size="middle">管理</CategoryManageButton>
          </Space.Compact>
          <Select placeholder="緊急程度" aria-label="緊急程度篩選" allowClear style={{ width: 100 }} onChange={(v) => { setFilterUrgency(v || ''); setPage(1) }} value={filterUrgency || undefined}>
            {Object.entries(URGENCY_LABELS).map(([v, l]) => <Option key={v} value={v}>{l}</Option>)}
          </Select>
          {(search || filterStatus || filterCategory || filterUrgency) && (
            <Button
              icon={<FilterOutlined />}
              onClick={() => { setSearch(''); setFilterStatus(''); setFilterCategory(''); setFilterUrgency(''); setPage(1) }}
            >
              清除篩選
            </Button>
          )}
        </Space>
      </WorkspaceToolbar>

      {canEditPetition && (
        <SelectionActionBar
          fixed
          selectedCount={selectedRowKeys.length}
          itemLabel="筆案件"
          onClear={() => setSelectedRowKeys([])}
        >
          <Button size="small" icon={<SwapOutlined />} loading={batchLoading} onClick={() => { setBatchAssigneeId(null); setBatchAssigneeOpen(true) }}>
            批次轉派
          </Button>
          <Button size="small" icon={<CheckCircleOutlined />} loading={batchLoading} onClick={handleBatchClose}>
            批次結案
          </Button>
          <Button size="small" icon={<ExclamationCircleOutlined />} loading={batchLoading} onClick={() => { setBatchUrgency('normal'); setBatchUrgencyOpen(true) }}>
            批次設定優先級
          </Button>
        </SelectionActionBar>
      )}
      <Card styles={{ body: isMobile ? { padding: 8 } : undefined }}>
        {isMobile ? (
          <List
            loading={loading}
            dataSource={data}
            locale={{
              emptyText: (search || filterStatus || filterCategory || filterUrgency)
                ? <EmptyState variant="search" title="查無符合條件的案件" description="試著放寬日期、狀態或類別條件。" />
                : <EmptyState title="尚無陳情案件" description="新增第一筆陳情後，SLA、承辦與處理紀錄會在這裡追蹤。" />,
            }}
            pagination={{
              current: page,
              pageSize,
              total,
              simple: true,
              onChange: (p, ps) => { setPage(p); setPageSize(ps) },
            }}
            renderItem={(record: any) => {
              const caseLabel = record.case_number || `案件 ${record.id}`
              return (
                <List.Item
                  key={record.id}
                  style={{ padding: '10px 8px', borderBottom: '1px solid rgba(0,0,0,0.06)' }}
                  actions={[
                    <Button
                      key="view"
                      size="small"
                      type="text"
                      icon={<EyeOutlined />}
                      aria-label={`查看陳情 ${caseLabel}`}
                      onClick={() => navigate(`/petitions/${record.id}`)}
                    />,
                    ...(canDeletePetition ? [
                      <Popconfirm
                        key="del"
                        title="確定刪除此陳情案件？"
                        description="刪除後將無法復原。"
                        okText="確定刪除"
                        cancelText="取消"
                        okButtonProps={{ danger: true }}
                        onConfirm={() => handleDelete(record.id)}
                      >
                        <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label={`刪除陳情 ${caseLabel}`} />
                      </Popconfirm>,
                    ] : []),
                  ]}
                >
                  <List.Item.Meta
                    title={
                      <Space size={6} wrap>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: getSLAColor(record.created_at, record.status), display: 'inline-block', flexShrink: 0 }} aria-hidden />
                        <a
                          role="link"
                          tabIndex={0}
                          onClick={() => navigate(`/petitions/${record.id}`)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/petitions/${record.id}`) } }}
                          style={{ fontWeight: 600, fontSize: 14 }}
                        >
                          {caseLabel}
                        </a>
                        <Tag color={STATUS_COLORS[record.status]} style={{ marginRight: 0 }}>{STATUS_LABELS[record.status]}</Tag>
                        {record.urgency && record.urgency !== 'normal' && (
                          <Tag color={URGENCY_COLORS[record.urgency]} style={{ marginRight: 0 }}>{URGENCY_LABELS[record.urgency]}</Tag>
                        )}
                      </Space>
                    }
                    description={
                      <Space direction="vertical" size={2} style={{ width: '100%' }}>
                        {record.content && (
                          <Text style={{ fontSize: 12 }} ellipsis>{record.content}</Text>
                        )}
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          {record.voter_name || '匿名'}
                          {record.category ? ` · ${record.category}` : ''}
                          {record.assignee_name ? ` · 承辦 ${record.assignee_name}` : ''}
                        </Text>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          {record.petition_date ? dayjs(record.petition_date).format('YYYY-MM-DD') : '—'}
                        </Text>
                      </Space>
                    }
                  />
                </List.Item>
              )
            }}
          />
        ) : (
          <Table
            columns={columns}
            dataSource={data}
            rowKey="id"
            loading={loading}
            size="small"
            rowSelection={canEditPetition ? { selectedRowKeys, onChange: (keys) => setSelectedRowKeys(keys as number[]) } : undefined}
            locale={{
              emptyText: (search || filterStatus || filterCategory || filterUrgency)
                ? <EmptyState variant="search" title="查無符合條件的案件" description="試著放寬日期、狀態或類別條件。" />
                : <EmptyState title="尚無陳情案件" description="新增第一筆陳情後，SLA、承辦與處理紀錄會在這裡追蹤。" />,
            }}
            pagination={{
              current: page, pageSize, total,
              showSizeChanger: true,
              showTotal: (t) => `共 ${t} 筆`,
              onChange: (p, ps) => { setPage(p); setPageSize(ps) },
            }}
            virtual={total > 100}
            scroll={{ x: 900, y: total > 100 ? 600 : undefined }}
          />
        )}
      </Card>

      <Drawer
        title="新增陳情案件"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        placement={isMobile ? 'bottom' : 'right'}
        height={isMobile ? '90vh' : undefined}
        width={isMobile ? '100%' : 600}
        destroyOnClose
        footer={
          <FormFooter
            onCancel={() => setDrawerOpen(false)}
            onSubmit={() => form.submit()}
            submitLoading={submitting}
            submitText="送出"
          />
        }
      >
        <Form form={form} layout="vertical" onFinish={handleSave} autoComplete="off"
          initialValues={{ urgency: 'normal', status: 'pending', petition_date: dayjs() }}>
          <FormSection title="陳情人與案件內容" description="可連結既有選民，也可直接填寫新聯絡人資料。">
            <Row gutter={12}>
              <Col xs={24} sm={12}>
                <Form.Item name="voter_id" label="搜尋選民（選填）" tooltip="從現有選民中挑選，若為新聯絡人請留空、改填下方姓名">
                  <Select
                    showSearch
                    allowClear
                    filterOption={false}
                    placeholder="輸入姓名或手機搜尋"
                    onSearch={searchVoters}
                    onChange={(value) => fillContactFromVoter(form, value)}
                    notFoundContent={null}
                  >
                    {voterOptions.map((v: any) => (
                      <Option key={v.id} value={v.id}>{v.name} {v.mobile ? `(${v.mobile})` : ''}</Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
              <Col xs={12} sm={6}>
                <Form.Item name="contact_name" label="陳情人姓名">
                  <Input placeholder="例：王小明" maxLength={50} autoComplete="off" />
                </Form.Item>
              </Col>
              <Col xs={12} sm={6}>
                <Form.Item name="contact_phone" label="聯絡電話">
                  <Input placeholder="0912345678" maxLength={20} autoComplete="off" />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={12}>
              <Col xs={24} sm={12}>
                <Form.Item name="petition_date" label="陳情日期" rules={[{ required: true }]}>
                  <DatePicker style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item name="channel" label="陳情方式">
                  <Select>
                    {['電話', '親訪', '書信', 'LINE', '電子郵件', '轉介', '其他'].map(c =>
                      <Option key={c} value={c}>{c}</Option>)}
                  </Select>
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <ManagedCategoryField name="category" label="陳情類別" tab="petition_category" buttonText="管理類別">
                  <AutoComplete
                    allowClear
                    placeholder={categories.length === 0 ? '尚未設定類別，可直接輸入' : '選擇或輸入關鍵字'}
                    options={categories.map(c => ({ value: c }))}
                    filterOption={(input, option) => String(option?.value || '').toLowerCase().includes(input.toLowerCase())}
                  />
                </ManagedCategoryField>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item name="urgency" label="急迫程度">
                  <Select>
                    <Option value="normal">一般</Option>
                    <Option value="urgent">急件</Option>
                    <Option value="critical">特急</Option>
                  </Select>
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item name="assignee_id" label="承辦人">
                  <Select allowClear>
                    {users.map(u => <Option key={u.id} value={u.id}>{u.name}</Option>)}
                  </Select>
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="content" label="陳情內容" rules={[{ required: true, message: '請填寫陳情內容' }]}>
              <TextArea rows={5} placeholder="詳細描述陳情事項..." />
            </Form.Item>
          </FormSection>

          <FormSection title="處理區域" description="標記案件發生區域，後續可用於熱點與缺口分析。">
            <Row gutter={12}>
              <Col span={24}>
                <ManagedCategoryField name="area_city" label="區域" tab="petition_area" buttonText="管理區域">
                  <AutoComplete
                    allowClear
                    placeholder={areas.length === 0 ? '尚未設定區域，可直接輸入' : '選擇或輸入區域'}
                    options={areas.map(a => ({ value: a }))}
                    filterOption={(input, option) => String(option?.value || '').toLowerCase().includes(input.toLowerCase())}
                  />
                </ManagedCategoryField>
              </Col>
              <Col span={24}>
                <Form.Item name="area_address" label="詳細地址"><Input placeholder="路段、門牌等" /></Form.Item>
              </Col>
            </Row>
          </FormSection>
        </Form>
      </Drawer>

      {/* 快速立案 Modal */}
      <Modal
        title="快速立案"
        open={quickOpen}
        onCancel={() => { setQuickOpen(false); quickForm.resetFields() }}
        onOk={() => quickForm.submit()}
        okText="立案"
        cancelText="取消"
      >
        <Form form={quickForm} layout="vertical" onFinish={handleQuickCreate} autoComplete="off"
          initialValues={QUICK_FORM_INITIAL}>
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="voter_id" label="搜尋選民（選填）" tooltip="從現有選民中挑選，若為新聯絡人請改填下方姓名">
                <Select
                  showSearch
                  allowClear
                  filterOption={false}
                  placeholder="輸入姓名或手機搜尋"
                  onSearch={searchVoters}
                  onChange={(value) => fillContactFromVoter(quickForm, value)}
                  notFoundContent={null}
                >
                  {voterOptions.map((v: any) => (
                    <Option key={v.id} value={v.id}>{v.name} {v.mobile ? `(${v.mobile})` : ''}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={12} sm={6}>
              <Form.Item name="contact_name" label="姓名">
                <Input placeholder="例：王小明" maxLength={50} autoComplete="off" />
              </Form.Item>
            </Col>
            <Col xs={12} sm={6}>
              <Form.Item name="contact_phone" label="聯絡電話">
                <Input placeholder="0912345678" maxLength={20} autoComplete="off" />
              </Form.Item>
            </Col>
          </Row>
          <div style={{ marginTop: -4, marginBottom: 8 }}>
            <Button type="link" size="small" style={{ padding: 0, fontSize: 12 }}
              onClick={() => setInlineVoterOpen(true)}>
              ＋ 新增選民
            </Button>
          </div>
          <Form.Item name="content" label="陳情內容" rules={[{ required: true, message: '請填寫陳情內容' }]}>
            <TextArea rows={4} placeholder="詳細描述陳情事項..." maxLength={5000} />
          </Form.Item>
          <ManagedCategoryField name="category" label="陳情類別" tab="petition_category" buttonText="管理類別">
            <AutoComplete
              allowClear
              placeholder={categories.length === 0 ? '尚未設定類別，可直接輸入' : '選擇或輸入關鍵字'}
              options={categories.map(c => ({ value: c }))}
              filterOption={(input, option) => String(option?.value || '').toLowerCase().includes(input.toLowerCase())}
            />
          </ManagedCategoryField>
          <Form.Item name="channel" label="陳情方式">
            <Select>
              {['電話', '現場', 'LINE', 'Email', '轉介'].map(c =>
                <Option key={c} value={c}>{c}</Option>)}
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      {/* 批量匯入 Modal */}
      <Modal
        title="批量匯入陳情案件"
        open={importModalOpen}
        onCancel={() => setImportModalOpen(false)}
        footer={null}
        width={480}
        destroyOnClose
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Alert
            type="info"
            showIcon
            message="請先下載範本，依格式填寫後上傳"
            description="支援欄位：日期、姓名、電話、陳情方式、類別、緊急程度、陳情內容、縣市、區域、里別、地址"
          />
          <Button icon={<DownloadOutlined />} onClick={handleDownloadTemplate} block>
            下載 Excel 範本
          </Button>
          <Upload.Dragger
            accept=".xlsx,.xls"
            beforeUpload={handleImportFile}
            showUploadList={false}
            disabled={importing}
          >
            <p className="ant-upload-drag-icon"><UploadOutlined /></p>
            <p className="ant-upload-text">點擊或拖曳 Excel 檔案至此上傳</p>
            <p className="ant-upload-hint">僅支援 .xlsx / .xls 格式</p>
          </Upload.Dragger>
          {importing && <div role="status" aria-live="polite" style={{ textAlign: 'center' }}>匯入中，請稍候...</div>}
          {importResult && (
            <Alert
              type={importResult.failed > 0 ? 'warning' : 'success'}
              showIcon
              message={`匯入完成：成功 ${importResult.imported} 筆，失敗 ${importResult.failed} 筆`}
              description={importResult.errors?.length > 0 && (
                <ul style={{ margin: 0, paddingLeft: 16 }}>
                  {importResult.errors.map((e: string, i: number) => <li key={i}>{e}</li>)}
                </ul>
              )}
            />
          )}
        </Space>
      </Modal>

      {/* 批次轉派 Modal */}
      <Modal
        title="批次轉派承辦人"
        open={batchAssigneeOpen}
        onCancel={() => { if (!batchLoading) setBatchAssigneeOpen(false) }}
        onOk={handleBatchAssignee}
        okText="套用"
        cancelText="取消"
        confirmLoading={batchLoading}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text type="secondary">將 {selectedRowKeys.length} 筆陳情案件轉派給：</Text>
          <Select
            showSearch
            style={{ width: '100%' }}
            placeholder="選擇承辦人"
            value={batchAssigneeId ?? undefined}
            onChange={(v: number) => setBatchAssigneeId(v)}
            optionFilterProp="children"
            filterOption={(input, opt) => String(opt?.children || '').toLowerCase().includes(input.toLowerCase())}
          >
            {users.map(u => <Option key={u.id} value={u.id}>{u.name}</Option>)}
          </Select>
        </Space>
      </Modal>

      {/* 批次設定優先級 Modal */}
      <Modal
        title="批次設定優先級"
        open={batchUrgencyOpen}
        onCancel={() => { if (!batchLoading) setBatchUrgencyOpen(false) }}
        onOk={handleBatchUrgency}
        okText="套用"
        cancelText="取消"
        confirmLoading={batchLoading}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text type="secondary">將 {selectedRowKeys.length} 筆陳情案件的優先級設定為：</Text>
          <Radio.Group
            value={batchUrgency}
            onChange={(e) => setBatchUrgency(e.target.value)}
          >
            <Radio value="normal">{URGENCY_LABELS.normal}</Radio>
            <Radio value="urgent">{URGENCY_LABELS.urgent}</Radio>
            <Radio value="critical">{URGENCY_LABELS.critical}</Radio>
          </Radio.Group>
        </Space>
      </Modal>

      {/* 快速新增選民 Modal */}
      <Modal title="快速新增選民" open={inlineVoterOpen} onCancel={() => setInlineVoterOpen(false)}
        onOk={() => inlineVoterForm.submit()} okText="新增" width={360} destroyOnClose>
        <Form form={inlineVoterForm} layout="vertical" onFinish={handleInlineVoterCreate}>
          <Form.Item name="name" label="姓名" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="mobile" label="手機" rules={[{ pattern: /^09\d{8}$/, message: '格式：09xxxxxxxx' }]}><Input /></Form.Item>
        </Form>
      </Modal>
    </PageScaffold>
  )
}
