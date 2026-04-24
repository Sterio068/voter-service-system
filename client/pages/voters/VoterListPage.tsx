import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  Table, Button, Space, Input, Select, Tag, Typography, Card,
  Modal, Form, DatePicker, Radio, Drawer, Row, Col, message, Popconfirm, Upload, Alert, Progress, notification, Popover, Spin
} from 'antd'
import {
  PlusOutlined, SearchOutlined, EditOutlined, DeleteOutlined, EyeOutlined,
  DownloadOutlined, UploadOutlined, FileExcelOutlined, FilterOutlined, TagsOutlined, StarOutlined
} from '@ant-design/icons'
import { useLocation, useNavigate } from 'react-router-dom'
import api from '../../utils/api'
import { useAuthStore } from '../../stores/authStore'
import { useDataSync } from '../../hooks/useDataSync'
import PageScaffold from '../../components/ui/PageScaffold'
import WorkspaceToolbar from '../../components/ui/WorkspaceToolbar'
import EmptyState from '../../components/ui/EmptyState'
import FormFooter from '../../components/ui/FormFooter'
import SelectionActionBar from '../../components/ui/SelectionActionBar'
import FormSection from '../../components/ui/FormSection'
import dayjs from 'dayjs'
import type { ColumnsType } from 'antd/es/table'
import type { UploadFile } from 'antd/es/upload'
import { hasModulePermission } from '../../utils/permissions'

const { Text } = Typography
const { Option } = Select

const TAG_COLORS: Record<string, string> = {
  '樁腳': 'red', '志工': 'blue', '捐款者': 'gold', '支持者': 'green', '意見領袖': 'purple'
}

export default function VoterListPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuthStore()
  const canCreateVoter = hasModulePermission(user?.role, 'voters', 'create')
  const canEditVoter = hasModulePermission(user?.role, 'voters', 'edit')
  const canDeleteVoter = hasModulePermission(user?.role, 'voters', 'delete')
  const canExportVoter = hasModulePermission(user?.role, 'voters', 'export')
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [search, setSearch] = useState('')
  const [filterCity, setFilterCity] = useState('')
  const [filterDistrict, setFilterDistrict] = useState('')
  const [filterVillage, setFilterVillage] = useState('')
  const [filterTag, setFilterTag] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingVoter, setEditingVoter] = useState<any>(null)
  const [form] = Form.useForm()
  const [tags, setTags] = useState<string[]>([])
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [importFile, setImportFile] = useState<UploadFile | null>(null)
  const [importLoading, setImportLoading] = useState(false)
  const [importResult, setImportResult] = useState<any>(null)
  const [preCheckResult, setPreCheckResult] = useState<any>(null)
  const [exporting, setExporting] = useState(false)
  const [fullExportOpen, setFullExportOpen] = useState(false)
  const [fullExportForm] = Form.useForm()
  const [duplicateWarning, setDuplicateWarning] = useState('')

  // U-7: Batch selection state
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [batchTagModalOpen, setBatchTagModalOpen] = useState(false)
  const [batchSupportModalOpen, setBatchSupportModalOpen] = useState(false)
  const [batchTags, setBatchTags] = useState<string[]>([])
  const [batchSupportLevel, setBatchSupportLevel] = useState<number | null>(null)
  const [batchProgress, setBatchProgress] = useState(0)
  const [batchRunning, setBatchRunning] = useState(false)

  // U-8: Duplicate detection state
  const [mobileDupWarning, setMobileDupWarning] = useState<string>('')
  const [idNumberDupWarning, setIdNumberDupWarning] = useState<string>('')

  // B-4: Undo ref for batch operations
  const undoDataRef = useRef<{ ids: number[], field: string, oldValues: Record<number, any> } | null>(null)
  const undoNotificationKey = 'batch-undo-notification'

  // F-5: Hover-to-prefetch state
  const [hoverVoter, setHoverVoter] = useState<any>(null)
  const [hoverLoading, setHoverLoading] = useState(false)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleVoterHover = (voterId: number) => {
    // 清除前一個未觸發的計時器，防止快速滑動時積累請求
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    hoverTimerRef.current = setTimeout(async () => {
      setHoverLoading(true)
      try {
        const res = await api.get(`/voters/${voterId}`)
        if (res.data.success) setHoverVoter(res.data.data)
      } catch {}
      setHoverLoading(false)
    }, 600)
  }

  const handleVoterLeave = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    setHoverVoter(null)
    setHoverLoading(false)
  }

  const COMMON_BATCH_TAGS = ['支持者', '搖擺選民', '反對者', '重要選民', '首投族', '長青族']

  // B-4: Undo handler
  const handleUndo = async () => {
    const undoData = undoDataRef.current
    if (!undoData) return
    notification.info({ key: undoNotificationKey, message: '正在撤銷...', duration: 0 })
    let done = 0
    for (const id of undoData.ids) {
      try {
        await api.put(`/voters/${id}`, { [undoData.field]: undoData.oldValues[id] })
      } catch {}
      done++
      if (done === undoData.ids.length) {
        notification.success({ key: undoNotificationKey, message: `已撤銷 ${undoData.ids.length} 位選民的批次更新`, duration: 4 })
        undoDataRef.current = null
        fetchVoters()
      }
    }
  }

  useEffect(() => {
    fetchVoters()
  }, [page, pageSize, search, filterCity, filterDistrict, filterVillage, filterTag])

  useEffect(() => {
    fetchTags()
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (new URLSearchParams(location.search).get('action') === 'new' && canCreateVoter) {
      setEditingVoter(null)
      setDuplicateWarning('')
      setMobileDupWarning('')
      setIdNumberDupWarning('')
      form.resetFields()
      setDrawerOpen(true)
    }
  }, [location.search, canCreateVoter, form])

  useDataSync((events) => {
    const hasVoterChange = events.some(e => e.target_type === 'voter')
    if (hasVoterChange) fetchVoters()
  }, [])

  const checkDuplicate = async (mobile: string) => {
    if (!mobile || !/^09\d{8}$/.test(mobile)) return
    try {
      const res = await api.get(`/voters?search=${mobile}&pageSize=3`)
      if (res.data.total > 0) {
        setDuplicateWarning(`⚠️ 發現 ${res.data.total} 位手機號碼相似的選民：${res.data.data.map((v: any) => v.name).join('、')}`)
      } else {
        setDuplicateWarning('')
      }
    } catch {}
  }

  // U-8: Real-time duplicate detection
  const checkMobileDuplicate = async (mobile: string) => {
    if (!mobile || !/^09\d{8}$/.test(mobile)) { setMobileDupWarning(''); return }
    try {
      const res = await api.get(`/voters?mobile=${encodeURIComponent(mobile)}&pageSize=1`)
      if (res.data.total > 0) {
        const found = res.data.data[0]
        if (!editingVoter || found.id !== editingVoter.id) {
          setMobileDupWarning(`⚠️ 此手機號碼已存在：${found.name}`)
          return
        }
      }
      setMobileDupWarning('')
    } catch { setMobileDupWarning('') }
  }

  const checkIdNumberDuplicate = async (idNumber: string) => {
    if (!idNumber || !/^[A-Z][12]\d{8}$/.test(idNumber)) { setIdNumberDupWarning(''); return }
    try {
      const res = await api.get(`/voters?id_number=${encodeURIComponent(idNumber)}&pageSize=1`)
      if (res.data.total > 0) {
        const found = res.data.data[0]
        if (!editingVoter || found.id !== editingVoter.id) {
          setIdNumberDupWarning(`⚠️ 此身分證號已存在：${found.name}`)
          return
        }
      }
      setIdNumberDupWarning('')
    } catch { setIdNumberDupWarning('') }
  }

  // U-7: Batch tag assignment
  const handleBatchTag = async () => {
    if (batchTags.length === 0) { message.warning('請選擇至少一個標籤'); return }
    setBatchRunning(true)
    setBatchProgress(0)
    const ids = selectedRowKeys as number[]

    // B-4: Store old values for undo
    const oldValues: Record<number, any> = {}
    for (const id of ids) {
      const voter = data.find((v: any) => v.id === id)
      oldValues[id] = voter?.tags ?? []
    }
    undoDataRef.current = { ids, field: 'tags', oldValues }

    let done = 0; let failed = 0
    for (const id of ids) {
      const voter = data.find((v: any) => v.id === id)
      const existingTags: string[] = voter?.tags || []
      const mergedTags = Array.from(new Set([...existingTags, ...batchTags]))
      try { await api.put(`/voters/${id}`, { tags: mergedTags }) } catch { failed++ }
      done++
      setBatchProgress(Math.round((done / ids.length) * 100))
    }
    setBatchRunning(false)
    setBatchTagModalOpen(false)
    setBatchTags([])
    setSelectedRowKeys([])
    notification[failed ? 'warning' : 'success']({
      key: undoNotificationKey,
      message: failed ? `批次更新完成，${failed} 位失敗` : `已完成批次更新 ${ids.length} 位選民`,
      description: '標籤已批次套用',
      btn: <Button size="small" onClick={handleUndo}>撤銷</Button>,
      duration: 30,
    })
    fetchVoters()
  }

  // U-7: Batch support level assignment
  const handleBatchSupportLevel = async () => {
    if (!batchSupportLevel) { message.warning('請選擇支持度'); return }
    setBatchRunning(true)
    setBatchProgress(0)
    const ids = selectedRowKeys as number[]

    // B-4: Store old values for undo
    const oldValues: Record<number, any> = {}
    for (const id of ids) {
      const voter = data.find((v: any) => v.id === id)
      oldValues[id] = voter?.support_level ?? null
    }
    undoDataRef.current = { ids, field: 'support_level', oldValues }

    let done = 0; let failed = 0
    for (const id of ids) {
      try { await api.put(`/voters/${id}`, { support_level: batchSupportLevel }) } catch { failed++ }
      done++
      setBatchProgress(Math.round((done / ids.length) * 100))
    }
    setBatchRunning(false)
    setBatchSupportModalOpen(false)
    setBatchSupportLevel(null)
    setSelectedRowKeys([])
    notification[failed ? 'warning' : 'success']({
      key: undoNotificationKey,
      message: failed ? `批次更新完成，${failed} 位失敗` : `已完成批次更新 ${ids.length} 位選民`,
      description: '支持度已批次套用',
      btn: <Button size="small" onClick={handleUndo}>撤銷</Button>,
      duration: 30,
    })
    fetchVoters()
  }

  const fetchTags = async () => {
    try {
      const res = await api.get('/admin/categories?type=voter_tag')
      setTags(res.data.data?.map((t: any) => t.name) || [])
    } catch {}
  }

  const fetchVoters = async () => {
    setLoading(true)
    try {
      const params: any = { page, pageSize }
      if (search) params.search = search
      if (filterCity) params.city = filterCity
      if (filterDistrict) params.district = filterDistrict
      if (filterVillage) params.village = filterVillage
      if (filterTag) params.tag = filterTag

      const res = await api.get('/voters', { params })
      setData(res.data.data || [])
      setTotal(res.data.total || 0)
    } catch (err) {
      message.error('載入選民資料失敗')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (values: any) => {
    try {
      // 過濾 null / 空字串（Antd Form 清空欄位會送 null，但後端 schema 不接受）
      const cleaned: Record<string, any> = {}
      for (const [k, v] of Object.entries(values)) {
        if (v !== null && v !== undefined && v !== '') cleaned[k] = v
      }
      const payload = {
        ...cleaned,
        birth_date: values.birth_date ? dayjs(values.birth_date).format('YYYY-MM-DD') : undefined,
        tags: values.tags || [],
      }

      if (editingVoter) {
        await api.put(`/voters/${editingVoter.id}`, payload)
        message.success('選民資料已更新')
      } else {
        await api.post('/voters', payload)
        message.success('選民資料已建立')
      }
      setDrawerOpen(false)
      form.resetFields()
      setEditingVoter(null)
      setDuplicateWarning('')
      setMobileDupWarning('')
      setIdNumberDupWarning('')
      fetchVoters()
    } catch (err: any) {
      message.error(err.response?.data?.error || '儲存失敗')
    }
  }

  const handleEdit = (voter: any) => {
    setEditingVoter(voter)
    setMobileDupWarning('')
    setIdNumberDupWarning('')
    form.setFieldsValue({
      ...voter,
      birth_date: voter.birth_date ? dayjs(voter.birth_date) : null,
    })
    setDrawerOpen(true)
  }

  const handleDelete = async (id: number, name: string) => {
    try {
      await api.delete(`/voters/${id}`)
      message.success(`已停用「${name}」`)
      fetchVoters()
    } catch {
      message.error('操作失敗')
    }
  }

  const handleExport = async (options: { includeSensitive?: boolean; reason?: string } = {}) => {
    setExporting(true)
    try {
      const params: any = {}
      if (search) params.search = search
      if (filterCity) params.city = filterCity
      if (filterDistrict) params.district = filterDistrict
      if (filterVillage) params.village = filterVillage
      if (filterTag) params.tag = filterTag
      if (options.includeSensitive) {
        params.include_sensitive = '1'
        params.reason = options.reason
      } else {
        params.mask = '1'
      }
      const res = await api.get('/voters/export', { params, responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `voters_${dayjs().format('YYYYMMDD')}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      message.success('匯出成功')
      if (options.includeSensitive) {
        setFullExportOpen(false)
        fullExportForm.resetFields()
      }
    } catch (err: any) {
      message.error(err.response?.data?.error || '匯出失敗')
    } finally {
      setExporting(false)
    }
  }

  const handleFullExport = async () => {
    const values = await fullExportForm.validateFields()
    await handleExport({ includeSensitive: true, reason: values.reason })
  }

  const handleDownloadTemplate = async () => {
    try {
      const res = await api.get('/voters/import/template', { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = 'voter_import_template.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      message.error('下載範本失敗')
    }
  }

  const handlePreCheck = async () => {
    if (!importFile?.originFileObj) return message.error('請選擇檔案')
    setImportLoading(true)
    setPreCheckResult(null)
    try {
      const formData = new FormData()
      formData.append('file', importFile.originFileObj)
      const res = await api.post('/voters/import?dryRun=true', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setPreCheckResult(res.data.preview)
    } catch (err: any) {
      message.error(err.response?.data?.error || '預檢失敗')
    } finally {
      setImportLoading(false)
    }
  }

  const handleImport = async () => {
    if (!importFile?.originFileObj) return message.error('請選擇檔案')
    setImportLoading(true)
    setImportResult(null)
    setPreCheckResult(null)
    try {
      const formData = new FormData()
      formData.append('file', importFile.originFileObj)
      const res = await api.post('/voters/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setImportResult(res.data.data)
      message.success(res.data.message)
      fetchVoters()
    } catch (err: any) {
      message.error(err.response?.data?.error || '匯入失敗')
    } finally {
      setImportLoading(false)
    }
  }

  const columns: ColumnsType<any> = [
    {
      title: '姓名',
      dataIndex: 'name',
      render: (name, record) => {
        const isHovered = hoverVoter?.id === record.id
        const showPopover = isHovered || (hoverLoading)
        const popoverContent = isHovered ? (
          <div style={{ width: 200 }}>
            <div>支持度：{'⭐'.repeat(hoverVoter.support_level || 0) || '未設定'}</div>
            <div>最後聯絡：{hoverVoter.last_contact_date || '未記錄'}</div>
            <div>陳情件數：{hoverVoter.petitions?.length || 0}</div>
            <div>標籤：{(() => { try { return (JSON.parse(hoverVoter.tags || '[]')).join('、') || '無' } catch { return (hoverVoter.tags || []).join('、') || '無' } })()}</div>
          </div>
        ) : <Spin size="small" />
        return (
          <Popover
            content={popoverContent}
            trigger="hover"
            open={isHovered || (hoverLoading && hoverTimerRef.current !== null)}
          >
            <a
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => handleVoterHover(record.id)}
              onMouseLeave={handleVoterLeave}
              onClick={() => navigate(`/voters/${record.id}`)}
            >
              {name}
            </a>
          </Popover>
        )
      },
    },
    { title: '性別', dataIndex: 'gender', width: 60 },
    { title: '手機', dataIndex: 'mobile', width: 120 },
    {
      title: '戶籍地址',
      render: (_, r) => [r.household_city, r.household_district, r.household_village, r.household_address].filter(Boolean).join(' '),
    },
    {
      title: '標籤',
      dataIndex: 'tags',
      render: (tags?: string[]) => (
        <Space size={2} wrap>
          {(tags || []).map(tag => (
            <Tag key={tag} color={TAG_COLORS[tag]} style={{ fontSize: 11, padding: '0 4px' }}>{tag}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: '建立日期',
      dataIndex: 'created_at',
      width: 110,
      render: (d) => dayjs(d).format('YYYY-MM-DD'),
    },
    {
      title: '操作',
      width: 120,
      render: (_, record) => (
        <Space>
          <Button
            size="small"
            icon={<EyeOutlined />}
            aria-label="查看選民"
            onClick={() => navigate(`/voters/${record.id}`)}
          />
          {canEditVoter && (
            <Button
              size="small"
              icon={<EditOutlined />}
              aria-label="編輯選民"
              onClick={() => handleEdit(record)}
            />
          )}
          {canDeleteVoter && (
            <Popconfirm title={`確定停用「${record.name}」？`} onConfirm={() => handleDelete(record.id, record.name)}>
              <Button size="small" icon={<DeleteOutlined />} aria-label="停用選民" danger />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  return (
    <PageScaffold
      eyebrow="Voter CRM"
      title="選民資料"
      titleLevel={4}
      variant="compact"
      description="集中管理名冊、標籤、匯入匯出與個資保護作業。"
      actions={
        <>
          {canExportVoter && (
            <>
              <Button icon={<DownloadOutlined />} onClick={() => handleExport()} loading={exporting}>匯出 Excel（遮罩）</Button>
              {user?.role === 'admin' && (
                <Button danger icon={<DownloadOutlined />} onClick={() => setFullExportOpen(true)} loading={exporting}>
                  完整匯出
                </Button>
              )}
            </>
          )}
          {canCreateVoter && (
            <>
              <Button icon={<UploadOutlined />} onClick={() => { setImportFile(null); setImportResult(null); setPreCheckResult(null); setImportModalOpen(true) }}>批次匯入</Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => {
                setEditingVoter(null); form.resetFields(); setDrawerOpen(true)
              }}>
                新增選民
              </Button>
            </>
          )}
        </>
      }
    >

      <WorkspaceToolbar
        title="名冊篩選"
        description="以姓名、電話、戶籍區域與標籤快速縮小選民名單。"
        meta={<Text type="secondary">共 {total} 筆</Text>}
      >
        <Space wrap>
          <Input.Search
            placeholder="姓名/手機/地址搜尋"
            allowClear
            style={{ width: 220 }}
            value={search}
            onChange={(e) => { if (!e.target.value) { setSearch(''); setPage(1) } }}
            onSearch={(v) => { setSearch(v); setPage(1) }}
            prefix={<SearchOutlined />}
          />
          <Select placeholder="縣市篩選" allowClear style={{ width: 130 }} value={filterCity || undefined} onChange={(v) => { setFilterCity(v || ''); setFilterDistrict(''); setFilterVillage(''); setPage(1) }}>
            {['台北市', '新北市', '桃園市', '台中市', '台南市', '高雄市', '基隆市', '新竹市', '嘉義市',
              '新竹縣', '苗栗縣', '彰化縣', '南投縣', '雲林縣', '嘉義縣', '屏東縣', '宜蘭縣', '花蓮縣', '台東縣',
              '澎湖縣', '金門縣', '連江縣'].map(c => <Option key={c} value={c}>{c}</Option>)}
          </Select>
          <Input
            placeholder="鄉鎮市區"
            allowClear
            style={{ width: 110 }}
            value={filterDistrict}
            onChange={(e) => { setFilterDistrict(e.target.value); setPage(1) }}
          />
          <Input
            placeholder="村里"
            allowClear
            style={{ width: 90 }}
            value={filterVillage}
            onChange={(e) => { setFilterVillage(e.target.value); setPage(1) }}
          />
          <Select placeholder="標籤篩選" allowClear style={{ width: 120 }} value={filterTag || undefined} onChange={(v) => { setFilterTag(v || ''); setPage(1) }}>
            {tags.map(t => <Option key={t} value={t}>{t}</Option>)}
          </Select>
          {(search || filterCity || filterDistrict || filterVillage || filterTag) && (
            <Button
              icon={<FilterOutlined />}
              onClick={() => { setSearch(''); setFilterCity(''); setFilterDistrict(''); setFilterVillage(''); setFilterTag(''); setPage(1) }}
            >
              清除篩選
            </Button>
          )}
        </Space>
      </WorkspaceToolbar>

      <Card>
        <Table
          columns={columns}
          dataSource={data}
          rowKey="id"
          loading={loading}
          size="small"
          rowSelection={canEditVoter ? {
            selectedRowKeys,
            onChange: (keys) => setSelectedRowKeys(keys),
          } : undefined}
          locale={{
            emptyText: (search || filterCity || filterDistrict || filterVillage || filterTag)
              ? <EmptyState variant="search" title="查無符合條件的選民" description="試著放寬姓名、區域或標籤條件。" />
              : <EmptyState title="尚無選民資料" description="新增第一筆選民後，名冊、標籤與互動紀錄會在這裡彙整。" />,
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
      </Card>

      {canEditVoter && (
        <SelectionActionBar
          fixed
          selectedCount={selectedRowKeys.length}
          itemLabel="位選民"
          onClear={() => setSelectedRowKeys([])}
        >
          <Button size="small" icon={<TagsOutlined />} onClick={() => { setBatchTags([]); setBatchProgress(0); setBatchTagModalOpen(true) }}>
            批次標籤
          </Button>
          <Button size="small" icon={<StarOutlined />} onClick={() => { setBatchSupportLevel(null); setBatchProgress(0); setBatchSupportModalOpen(true) }}>
            批次設定支持度
          </Button>
        </SelectionActionBar>
      )}

      {/* 批次匯入 Modal */}
      <Modal
        title="批次匯入選民資料"
        open={importModalOpen}
        onCancel={() => setImportModalOpen(false)}
        footer={null}
        width={520}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Alert
            message="請先下載匯入範本，依照格式填寫後再上傳"
            type="info"
            showIcon
            action={
              <Button size="small" icon={<FileExcelOutlined />} onClick={handleDownloadTemplate}>
                下載範本
              </Button>
            }
          />
          <Upload
            accept=".xlsx,.xls"
            maxCount={1}
            beforeUpload={() => false}
            onChange={({ fileList }) => setImportFile(fileList[0] || null)}
            fileList={importFile ? [importFile] : []}
          >
            <Button icon={<UploadOutlined />}>選擇 Excel 檔案</Button>
          </Upload>
          {preCheckResult && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Alert
                type={preCheckResult.error_count > 0 ? 'warning' : 'success'}
                message={`預檢結果：${preCheckResult.valid_count} 筆可匯入，${preCheckResult.error_count} 筆有錯誤`}
                description={preCheckResult.errors?.length > 0 && (
                  <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12 }}>
                    {preCheckResult.errors.map((e: string, i: number) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                )}
              />
              {preCheckResult.address_preview?.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, color: '#8e8e93', marginBottom: 4 }}>
                    📍 地址解析預覽（前 {preCheckResult.address_preview.length} 筆）
                  </div>
                  <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f5f5f7' }}>
                        {['姓名', '縣市', '鄉鎮區', '村里', '門牌'].map(h => (
                          <th key={h} style={{ padding: '3px 6px', border: '1px solid #e0e0e0', fontWeight: 500, textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preCheckResult.address_preview.map((p: any, i: number) => (
                        <tr key={i}>
                          <td style={{ padding: '3px 6px', border: '1px solid #e0e0e0' }}>{p.name}</td>
                          <td style={{ padding: '3px 6px', border: '1px solid #e0e0e0', color: p.household_city ? '#000' : '#ccc' }}>{p.household_city || '—'}</td>
                          <td style={{ padding: '3px 6px', border: '1px solid #e0e0e0', color: p.household_district ? '#000' : '#ccc' }}>{p.household_district || '—'}</td>
                          <td style={{ padding: '3px 6px', border: '1px solid #e0e0e0', color: p.household_village ? '#000' : '#ccc' }}>{p.household_village || '—'}</td>
                          <td style={{ padding: '3px 6px', border: '1px solid #e0e0e0', color: p.household_address ? '#000' : '#ccc' }}>{p.household_address || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          {importResult && (
            <div>
              <Progress
                percent={importResult.success + importResult.failed > 0
                  ? Math.round((importResult.success / (importResult.success + importResult.failed)) * 100)
                  : 0}
                status={importResult.failed > 0 ? 'exception' : 'success'}
                format={() => `${importResult.success} 成功 / ${importResult.failed} 失敗`}
              />
              {importResult.errors?.length > 0 && (
                <Alert
                  type="warning"
                  message={`錯誤明細（最多顯示 ${importResult.errors.length} 筆）`}
                  description={
                    <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12 }}>
                      {importResult.errors.map((e: any, i: number) => (
                        <li key={i}>第 {e.row} 列：{e.error}</li>
                      ))}
                    </ul>
                  }
                />
              )}
            </div>
          )}
          <div style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setImportModalOpen(false)}>取消</Button>
              <Button loading={importLoading} onClick={handlePreCheck} disabled={!importFile}>
                預檢
              </Button>
              <Button type="primary" loading={importLoading} onClick={handleImport} disabled={!importFile}>
                開始匯入
              </Button>
            </Space>
          </div>
        </Space>
      </Modal>

      {/* U-7: Batch tag modal */}
      <Modal
        title="批次設定標籤"
        open={batchTagModalOpen}
        onCancel={() => { if (!batchRunning) setBatchTagModalOpen(false) }}
        onOk={handleBatchTag}
        okText="確認套用"
        cancelText="取消"
        confirmLoading={batchRunning}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text type="secondary">選擇要批次套用到 {selectedRowKeys.length} 位選民的標籤（將附加到現有標籤，不重複）：</Text>
          <Select
            mode="multiple"
            style={{ width: '100%' }}
            placeholder="選擇標籤"
            value={batchTags}
            onChange={setBatchTags}
            options={COMMON_BATCH_TAGS.map(t => ({ label: t, value: t }))}
          />
          {batchRunning && <Progress percent={batchProgress} size="small" />}
        </Space>
      </Modal>

      {/* U-7: Batch support level modal */}
      <Modal
        title="批次設定支持度"
        open={batchSupportModalOpen}
        onCancel={() => { if (!batchRunning) setBatchSupportModalOpen(false) }}
        onOk={handleBatchSupportLevel}
        okText="確認套用"
        cancelText="取消"
        confirmLoading={batchRunning}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text type="secondary">設定 {selectedRowKeys.length} 位選民的支持度：</Text>
          <Select
            style={{ width: '100%' }}
            placeholder="選擇支持度"
            value={batchSupportLevel ?? undefined}
            onChange={(v) => setBatchSupportLevel(v)}
            options={[1,2,3,4,5].map(n => ({ label: `${n} 星`, value: n }))}
          />
          {batchRunning && <Progress percent={batchProgress} size="small" />}
        </Space>
      </Modal>

      <Modal
        title="完整個資匯出"
        open={fullExportOpen}
        onCancel={() => setFullExportOpen(false)}
        onOk={handleFullExport}
        okText="確認完整匯出"
        okButtonProps={{ danger: true, loading: exporting }}
      >
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="完整匯出會包含未遮罩的身份證、電話、Email 與地址"
          description="此操作僅限管理員，系統會記錄匯出理由與篩選條件。若只是一般名冊需求，請使用遮罩匯出。"
        />
        <Form form={fullExportForm} layout="vertical">
          <Form.Item
            name="reason"
            label="完整匯出理由"
            rules={[
              { required: true, message: '請填寫完整匯出理由' },
              { min: 5, message: '理由至少 5 個字' },
            ]}
          >
            <Input.TextArea rows={3} maxLength={200} showCount placeholder="例：主管核准寄送正式通知，需完整地址與電話" />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={editingVoter ? '編輯選民' : '新增選民'}
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); form.resetFields(); setDuplicateWarning(''); setMobileDupWarning(''); setIdNumberDupWarning('') }}
        width={600}
        destroyOnClose
        footer={
          <FormFooter
            onCancel={() => setDrawerOpen(false)}
            onSubmit={() => form.submit()}
            extra={!editingVoter && (
              <Button onClick={async () => {
                try {
                  const values = await form.validateFields()
                  const payload = {
                    ...values,
                    birth_date: values.birth_date ? dayjs(values.birth_date).format('YYYY-MM-DD') : undefined,
                    tags: values.tags || [],
                  }
                  await api.post('/voters', payload)
                  message.success('選民資料已建立')
                  form.resetFields()
                  setDuplicateWarning('')
                  setMobileDupWarning('')
                  setIdNumberDupWarning('')
                  fetchVoters()
                } catch (err: any) {
                  if (err?.errorFields) return
                  message.error(err.response?.data?.error || '儲存失敗')
                }
              }}>儲存並繼續新增</Button>
            )}
          />
        }
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <FormSection title="基本資料" description="姓名與聯絡方式是服務追蹤、匯出與重複檢查的核心欄位。">
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="name" label="姓名" rules={[{ required: true, message: '請輸入姓名' }]}>
                  <Input />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="gender" label="性別">
                  <Radio.Group>
                    <Radio value="男">男</Radio>
                    <Radio value="女">女</Radio>
                    <Radio value="其他">其他</Radio>
                  </Radio.Group>
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="birth_date" label="出生日期">
                  <DatePicker style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="mobile"
                  label="手機"
                  rules={[{ pattern: /^09\d{8}$/, message: '手機格式：09xxxxxxxx' }]}
                  validateStatus={mobileDupWarning ? 'warning' : undefined}
                  help={mobileDupWarning || (duplicateWarning ? <span style={{ color: '#fa8c16', fontSize: 12 }}>{duplicateWarning}</span> : undefined)}
                >
                  <Input
                    onChange={() => {
                      if (duplicateWarning) setDuplicateWarning('')
                      if (mobileDupWarning) setMobileDupWarning('')
                    }}
                    onBlur={e => { checkDuplicate(e.target.value); checkMobileDuplicate(e.target.value) }}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="phone" label="市話">
                  <Input />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="line_id" label="LINE ID">
                  <Input />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="id_number"
                  label="身分證號"
                  rules={[{ pattern: /^[A-Z][12]\d{8}$/, message: '身分證格式不正確' }]}
                  validateStatus={idNumberDupWarning ? 'warning' : undefined}
                  help={idNumberDupWarning || undefined}
                >
                  <Input
                    onChange={() => { if (idNumberDupWarning) setIdNumberDupWarning('') }}
                    onBlur={e => checkIdNumberDuplicate(e.target.value)}
                  />
                </Form.Item>
              </Col>
              <Col span={24}>
                <Form.Item name="email" label="電子郵件" rules={[{ type: 'email', message: '請輸入有效的電子郵件' }]}>
                  <Input type="email" />
                </Form.Item>
              </Col>
            </Row>
          </FormSection>

          <FormSection title="戶籍資料" description="完整區域資訊可支援選區篩選、地址標籤與地理分析。">
            <Row gutter={12}>
              <Col span={8}>
                <Form.Item name="household_city" label="縣市">
                  <Input />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="household_district" label="鄉鎮區">
                  <Input />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="household_village" label="村里">
                  <Input />
                </Form.Item>
              </Col>
              <Col span={24}>
                <Form.Item name="household_address" label="詳細地址">
                  <Input />
                </Form.Item>
              </Col>
            </Row>
          </FormSection>

          <FormSection title="職業與標籤" description="標籤與職業資訊會影響分眾服務、活動邀請與關係經營。">
            <Row gutter={12}>
              <Col span={8}>
                <Form.Item name="occupation" label="職業">
                  <Input />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="company" label="服務單位">
                  <Input />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="job_title" label="職稱">
                  <Input />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="tags" label="標籤">
              <Select mode="multiple" placeholder="選擇標籤">
                {tags.map(t => <Option key={t} value={t}>{t}</Option>)}
              </Select>
            </Form.Item>
          </FormSection>

          <FormSection title="其他資訊" description="補充來源、介紹人與備註，讓後續交接更有脈絡。">
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="source" label="認識來源">
                  <Select allowClear>
                    <Option value="activity">活動認識</Option>
                    <Option value="referral">朋友介紹</Option>
                    <Option value="signboard">看板/文宣</Option>
                    <Option value="online">網路</Option>
                    <Option value="walk_in">自行來訪</Option>
                    <Option value="other">其他</Option>
                  </Select>
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="referrer_id" label="介紹人">
                  <Select allowClear showSearch placeholder="搜尋介紹人（選民）"
                    filterOption={(input, opt) => String(opt?.children || '').toLowerCase().includes(input.toLowerCase())}>
                    {data.map((v: any) => <Option key={v.id} value={v.id}>{v.name}{v.mobile ? ` (${v.mobile})` : ''}</Option>)}
                  </Select>
                </Form.Item>
              </Col>
            </Row>

            <Form.Item name="note" label="備註">
              <Input.TextArea rows={3} />
            </Form.Item>
          </FormSection>
        </Form>
      </Drawer>
    </PageScaffold>
  )
}
