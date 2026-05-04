import React, { useState, useEffect } from 'react'
import AttachmentUpload from '../../components/AttachmentUpload'
import { Table, Button, Space, Input, Select, Tag, Typography, Card, Drawer, Form, DatePicker, message, Tabs, Row, Col, Divider, Descriptions, Popconfirm } from 'antd'
import { PlusOutlined, SearchOutlined, PrinterOutlined, FileWordOutlined, FilePdfOutlined, EyeOutlined, FilterOutlined, DeleteOutlined, RobotOutlined } from '@ant-design/icons'
import api from '../../utils/api'
import AIButton from '../../components/ai/AIButton'
import PageScaffold from '../../components/ui/PageScaffold'
import WorkspaceToolbar from '../../components/ui/WorkspaceToolbar'
import EmptyState from '../../components/ui/EmptyState'
import FormFooter from '../../components/ui/FormFooter'
import FormSection from '../../components/ui/FormSection'
import ManagedCategoryField from '../../components/ManagedCategoryField'
import { useAuthStore } from '../../stores/authStore'
import { hasModulePermission } from '../../utils/permissions'
import dayjs from 'dayjs'
import type { ColumnsType } from 'antd/es/table'

const { Text } = Typography
const { Option } = Select
const { TextArea } = Input

const STATUS_COLORS: Record<string, string> = { pending: 'orange', processing: 'blue', replied: 'cyan', archived: 'default' }
const STATUS_LABELS: Record<string, string> = { pending: '待處理', processing: '處理中', replied: '已回覆', archived: '已歸檔' }
const FALLBACK_STATUS_LABEL = '未設定'

/** 西元日期字串 → 民國日期（顯示用） */
function toROC(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const d = dayjs(dateStr)
  if (!d.isValid()) return dateStr || '—'
  const rocYear = d.year() - 1911
  return `民國${rocYear}年${String(d.month() + 1).padStart(2, '0')}月${String(d.date()).padStart(2, '0')}日`
}

/** DatePicker format function → 民國顯示格式 */
const rocPickerFormat = (value: dayjs.Dayjs) =>
  `民國${value.year() - 1911}年${String(value.month() + 1).padStart(2, '0')}月${String(value.date()).padStart(2, '0')}日`

function printDocument(doc: any, officeName: string) {
  const w = window.open('', '_blank')
  if (!w) return message.error('無法開啟列印視窗')
  const docTypeLabel = doc.doc_type === 'incoming' ? '收文' : '發文'
  w.document.write(`<!DOCTYPE html><html lang="zh-TW"><head>
<meta charset="UTF-8"><title>${doc.doc_number}</title>
<style>
  body { font-family:'微軟正黑體','Noto Sans TC',sans-serif; margin:20mm 25mm; font-size:12pt; line-height:1.8; }
  .header { text-align:center; margin-bottom:24px; }
  .office { font-size:16pt; font-weight:bold; }
  .doc-type { font-size:14pt; margin-top:4px; }
  .doc-number { font-size:11pt; color:#666; }
  table { width:100%; border-collapse:collapse; margin:16px 0; }
  td { padding:6px 10px; border:1px solid #ccc; }
  .label { width:100px; background:#f5f5f5; font-weight:bold; }
  .subject { font-size:14pt; font-weight:bold; margin:20px 0 8px; border-bottom:2px solid #333; padding-bottom:4px; }
  .content { min-height:120px; margin-top:8px; }
  .footer { margin-top:40px; }
  @media print { @page { size: A4 portrait; margin: 20mm 25mm; } }
</style></head><body>
<div class="header">
  <div class="office">${officeName}</div>
  <div class="doc-type">${docTypeLabel}公文</div>
  <div class="doc-number">文號：${doc.doc_number}</div>
</div>
<table>
  <tr><td class="label">${doc.doc_type === 'incoming' ? '來文機關' : '受文機關'}</td><td>${doc.org_name || '—'}</td>
      <td class="label">公文日期</td><td>${toROC(doc.doc_date)}</td></tr>
  ${doc.doc_type === 'incoming' ? `<tr><td class="label">來文字號</td><td>${doc.org_doc_number || '—'}</td>
      <td class="label">來文日期</td><td>${toROC(doc.org_doc_date)}</td></tr>` : ''}
  <tr><td class="label">類別</td><td>${doc.category || '—'}</td>
      <td class="label">承辦人</td><td>${doc.assignee_name || '—'}</td></tr>
  <tr><td class="label">處理期限</td><td>${toROC(doc.deadline)}</td>
      <td class="label">狀態</td><td>${STATUS_LABELS[doc.status] || doc.status}</td></tr>
</table>
<div class="subject">主旨</div>
<div>${doc.subject || ''}</div>
${doc.content_summary ? `<div class="subject">說明</div><div class="content">${doc.content_summary.replace(/\n/g, '<br>')}</div>` : ''}
<div class="footer">
  <table style="border:none; margin-top:40px;">
    <tr style="border:none;">
      <td style="border:none; width:33%; text-align:center;">承辦人：<br><br>________________</td>
      <td style="border:none; width:33%; text-align:center;">主管：<br><br>________________</td>
      <td style="border:none; width:33%; text-align:center;">機關首長：<br><br>________________</td>
    </tr>
  </table>
</div>
</body></html>`)
  w.document.close()
  // Use setTimeout to ensure document is fully rendered before printing
  w.onload = () => { w.focus(); w.print() }
  setTimeout(() => { if (!w.closed) { w.focus(); w.print() } }, 500)
}

function exportDocumentWord(doc: any, officeName: string, officeInfo?: { address?: string; phone?: string; fax?: string; email?: string; contact?: string }) {
  const isIncoming = doc.doc_type === 'incoming'

  // 機關聯絡資訊區塊（地址、聯絡人、電話、傳真、電子信箱）
  const contactLines: string[] = []
  if (officeInfo?.address)  contactLines.push(`<p class="contact-line"><span class="cl">地　　址：</span>${officeInfo.address}</p>`)
  if (officeInfo?.contact)  contactLines.push(`<p class="contact-line"><span class="cl">聯 絡 人：</span>${officeInfo.contact}</p>`)
  if (officeInfo?.phone)    contactLines.push(`<p class="contact-line"><span class="cl">電　　話：</span>${officeInfo.phone}</p>`)
  if (officeInfo?.fax)      contactLines.push(`<p class="contact-line"><span class="cl">傳　　真：</span>${officeInfo.fax}</p>`)
  if (officeInfo?.email)    contactLines.push(`<p class="contact-line"><span class="cl">電子信箱：</span>${officeInfo.email}</p>`)
  const contactBlock = contactLines.length > 0
    ? `<div class="contact-block">${contactLines.join('')}</div>`
    : ''

  // 說明欄：將換行後的每行包成條列（一、二、三…）
  let mingLines = ''
  if (doc.content_summary) {
    const lines = doc.content_summary.split('\n').map((l: string) => l.trim()).filter(Boolean)
    const nums = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']
    if (lines.length === 1) {
      mingLines = `<p style="margin:0 0 0 2em; text-indent:-2em;">${lines[0]}</p>`
    } else {
      mingLines = lines.map((l: string, i: number) => {
        const n = i < nums.length ? nums[i] : String(i + 1)
        return `<p style="margin:0 0 0 2em; text-indent:-2em;">${n}、${l}</p>`
      }).join('')
    }
  }

  const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset="UTF-8">
<!--[if gte mso 9]><xml>
<w:WordDocument>
  <w:View>Print</w:View>
  <w:Zoom>100</w:Zoom>
  <w:DoNotOptimizeForBrowser/>
</w:WordDocument>
</xml><![endif]-->
<style>
@page {
  size: 21cm 29.7cm;
  margin: 3cm 2.5cm 2.5cm 3cm;
  mso-page-orientation: portrait;
}
body {
  font-family: "標楷體", "DFKai-SB", "BiauKai", serif;
  font-size: 14pt;
  line-height: 200%;
  color: #000000;
  margin: 0;
  padding: 0;
}
p { margin: 0; padding: 0; line-height: 200%; }
.agency {
  font-size: 22pt;
  font-weight: bold;
  text-align: center;
  letter-spacing: 8pt;
  margin-bottom: 0;
}
.doc-type {
  font-size: 18pt;
  font-weight: bold;
  text-align: center;
  letter-spacing: 12pt;
  margin-top: 0;
  margin-bottom: 14pt;
}
.field-line {
  margin: 0;
  padding: 0;
  line-height: 220%;
}
.field-label {
  font-size: 14pt;
}
.section-title {
  font-size: 14pt;
  font-weight: bold;
  margin-top: 6pt;
  margin-bottom: 0;
}
.section-body {
  font-size: 14pt;
  margin-left: 2em;
  margin-bottom: 0;
}
.divider {
  border: none;
  border-top: 1pt solid #000;
  margin: 12pt 0 8pt 0;
}
.copy-section {
  font-size: 12pt;
  line-height: 190%;
  margin-top: 4pt;
}
.sign-section {
  text-align: right;
  font-size: 14pt;
  line-height: 220%;
  margin-top: 20pt;
}
.contact-block {
  margin-bottom: 6pt;
}
.contact-line {
  margin: 0;
  padding: 0;
  font-size: 12pt;
  line-height: 190%;
}
.cl {
  font-size: 12pt;
}
</style>
</head>
<body>
<p class="agency">${officeName}</p>
<p class="doc-type">函</p>

${contactBlock}

<p class="field-line"><span class="field-label">受文者：</span>${doc.org_name || '　　　　　　'}</p>
<p class="field-line"><span class="field-label">發文日期：</span>${toROC(doc.doc_date)}</p>
<p class="field-line"><span class="field-label">發文字號：</span>${doc.doc_number || '　　字第　　　　號'}</p>
<p class="field-line"><span class="field-label">速　　別：</span>普通件</p>
<p class="field-line"><span class="field-label">密等及解密條件或保密期限：</span>普通</p>
<p class="field-line"><span class="field-label">附　　件：</span>${isIncoming ? (doc.org_doc_number ? `來文字號 ${doc.org_doc_number}` : '無') : '無'}</p>

<br>
<p class="field-line"><span class="field-label">主　　旨：</span>${doc.subject || ''}。</p>

${doc.content_summary ? `
<p class="section-title">說　　明：</p>
<div class="section-body">${mingLines}</div>
` : ''}

<br>
<p class="field-line" style="font-size:12pt;">正　　本：${isIncoming ? (doc.org_name || '（來文機關）') : (doc.org_name || '（受文者）')}</p>
<p class="field-line" style="font-size:12pt;">副　　本：</p>

<div class="sign-section">
  ${officeName}　<br>
  首長：
</div>
</body>
</html>`

  const blob = new Blob(['\ufeff' + html], { type: 'application/msword' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${doc.doc_number || '公文'}.doc`
  a.click()
  URL.revokeObjectURL(url)
}

function DocTable({ docType }: { docType: 'incoming' | 'outgoing' }) {
  const { user } = useAuthStore()
  const canCreateDocument = hasModulePermission(user?.role, 'documents', 'create')
  const canEditDocument = hasModulePermission(user?.role, 'documents', 'edit')
  const canDeleteDocument = hasModulePermission(user?.role, 'documents', 'delete')
  const canExportDocument = hasModulePermission(user?.role, 'documents', 'export')
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [filterStatus, setFilterStatus] = useState('')
  const [search, setSearch] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false)
  const [selectedDoc, setSelectedDoc] = useState<any>(null)
  const [form] = Form.useForm()
  const [transferForm] = Form.useForm()
  const [users, setUsers] = useState<any[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [officeName, setOfficeName] = useState('選民服務系統')
  const [officeInfo, setOfficeInfo] = useState<{ address?: string; phone?: string; fax?: string; email?: string; contact?: string }>({})
  const [petitionOptions, setPetitionOptions] = useState<any[]>([])

  useEffect(() => {
    api.get('/users/list').then(r => setUsers(r.data.data || [])).catch(() => {})
    api.get('/admin/categories?type=doc_category').then(r => setCategories(r.data.data?.map((c: any) => c.name) || [])).catch(() => {})
    api.get('/admin/settings').then(r => {
      const s = r.data.data || {}
      if (s.office_name) setOfficeName(s.office_name)
      setOfficeInfo({
        address: s.office_address || '',
        phone: s.office_phone || '',
        fax: s.office_fax || '',
        email: s.office_email || '',
        contact: s.office_contact || '',
      })
    }).catch(() => {})
  }, [])

  const searchPetitions = async (val: string) => {
    if (!val || val.length < 1) return
    try {
      const res = await api.get(`/petitions?search=${encodeURIComponent(val)}&pageSize=10`)
      setPetitionOptions(res.data.data || [])
    } catch {}
  }

  useEffect(() => { fetchDocs() }, [page, filterStatus, search])

  useEffect(() => {
    if (!detailDrawerOpen || !selectedDoc) {
      transferForm.resetFields()
      return
    }

    transferForm.setFieldsValue({
      transfer_to: selectedDoc.transfer_to,
      transfer_date: selectedDoc.transfer_date ? dayjs(selectedDoc.transfer_date) : undefined,
      transfer_note: selectedDoc.transfer_note,
    })
  }, [detailDrawerOpen, selectedDoc, transferForm])

  const fetchDocs = async () => {
    setLoading(true)
    try {
      const params: any = { page, pageSize: 20, doc_type: docType }
      if (filterStatus) params.status = filterStatus
      if (search) params.search = search
      const res = await api.get('/documents', { params })
      setData(res.data.data || [])
      setTotal(res.data.total || 0)
    } catch { message.error('載入失敗') }
    finally { setLoading(false) }
  }

  const handleSave = async (values: any) => {
    try {
      const res = await api.post('/documents', {
        ...values,
        doc_type: docType,
        doc_date: values.doc_date ? dayjs(values.doc_date).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
        deadline: values.deadline ? dayjs(values.deadline).format('YYYY-MM-DD') : undefined,
        org_doc_date: values.org_doc_date ? dayjs(values.org_doc_date).format('YYYY-MM-DD') : undefined,
      })
      message.success('公文已建立')
      setDrawerOpen(false)
      form.resetFields()
      fetchDocs()
      // Show detail drawer for the new document
      const newDocRes = await api.get(`/documents/${res.data.data.id}`)
      setSelectedDoc({ ...newDocRes.data.data, assignee_name: users.find(u => u.id === values.assignee_id)?.name })
      setDetailDrawerOpen(true)
    } catch (err: any) { message.error(err.response?.data?.error || '建立失敗') }
  }

  const handleRowClick = async (doc: any) => {
    try {
      const res = await api.get(`/documents/${doc.id}`)
      setSelectedDoc({ ...res.data.data, assignee_name: doc.assignee_name })
      setDetailDrawerOpen(true)
    } catch { message.error('載入公文失敗') }
  }

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/documents/${id}`)
      message.success('公文已刪除')
      setDetailDrawerOpen(false)
      setSelectedDoc(null)
      fetchDocs()
    } catch { message.error('刪除失敗') }
  }

  const isOverdue = (deadline: string, status: string) =>
    deadline && status !== 'archived' && dayjs(deadline).isBefore(dayjs(), 'day')

  const columns: ColumnsType<any> = [
    { title: '文號', dataIndex: 'doc_number', width: 150 },
    { title: docType === 'incoming' ? '來文機關' : '受文機關', dataIndex: 'org_name', width: 120 },
    { title: '主旨', dataIndex: 'subject', ellipsis: true },
    { title: '類別', dataIndex: 'category', width: 90 },
    { title: '承辦人', dataIndex: 'assignee_name', width: 90 },
    {
      title: '狀態', dataIndex: 'status', width: 90,
      render: (s) => <Tag color={STATUS_COLORS[s] || 'default'}>{STATUS_LABELS[s] || FALLBACK_STATUS_LABEL}</Tag>,
    },
    {
      title: '期限', dataIndex: 'deadline', width: 120,
      render: (d, r) => d ? (
        <Text type={isOverdue(d, r.status) ? 'danger' : 'secondary'} style={{ fontSize: 12 }}>
          {toROC(d)}{isOverdue(d, r.status) ? ' ⚠️' : ''}
        </Text>
      ) : '-',
    },
    { title: '日期', dataIndex: 'doc_date', width: 120, render: d => toROC(d) },
    {
      title: '操作', width: 80, fixed: 'right' as const,
      render: (_: any, r: any) => (
        <Button size="small" icon={<EyeOutlined />} type="link" onClick={(e) => { e.stopPropagation(); handleRowClick(r) }}>
          詳情
        </Button>
      ),
    },
  ]

  return (
    <div>
      <WorkspaceToolbar
        title={docType === 'incoming' ? '收文篩選' : '發文篩選'}
        description="搜尋主旨或依處理狀態縮小公文工作清單。"
        meta={<Text type="secondary">共 {total} 筆</Text>}
        actions={canCreateDocument ? (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setDrawerOpen(true) }}>
            新增{docType === 'incoming' ? '收文' : '發文'}
          </Button>
        ) : undefined}
      >
        <Space wrap>
          <Input.Search
            placeholder="搜尋主旨"
            allowClear
            style={{ width: 200 }}
            value={search}
            onChange={(e) => { if (!e.target.value) setSearch('') }}
            onSearch={setSearch}
            prefix={<SearchOutlined />}
          />
          <Select placeholder="狀態篩選" allowClear style={{ width: 110 }} value={filterStatus || undefined} onChange={(v) => setFilterStatus(v || '')}>
            {Object.entries(STATUS_LABELS).map(([v, l]) => <Option key={v} value={v}>{l}</Option>)}
          </Select>
          {(search || filterStatus) && (
            <Button
              icon={<FilterOutlined />}
              onClick={() => { setSearch(''); setFilterStatus(''); setPage(1) }}
            >
              清除篩選
            </Button>
          )}
        </Space>
      </WorkspaceToolbar>

      <Table
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={loading}
        size="small"
        locale={{
          emptyText: (search || filterStatus)
            ? <EmptyState variant="search" title="查無符合條件的公文" description="可調整主旨關鍵字或狀態篩選。" />
            : <EmptyState title="尚無公文資料" description="新增收文或發文後，期限與承辦進度會在這裡彙整。" />,
        }}
        onRow={(r) => ({ onClick: () => handleRowClick(r), style: { cursor: 'pointer' } })}
        pagination={{ current: page, pageSize: 20, total, showTotal: t => `共 ${t} 筆`, onChange: setPage }}
        scroll={{ x: 800 }}
      />

      {/* 新增公文 */}
      <Drawer title={`新增${docType === 'incoming' ? '收文' : '發文'}`} open={drawerOpen}
        onClose={() => setDrawerOpen(false)} width={560}
        destroyOnClose
        footer={<FormFooter onCancel={() => setDrawerOpen(false)} onSubmit={() => form.submit()} />}>
        <Form form={form} layout="vertical" onFinish={handleSave} initialValues={{ doc_date: dayjs() }}>
          <FormSection title="公文基本資料" description="先填主旨、日期、分類與機關資訊，系統會自動配置公文流程。">
            <Form.Item name="subject" label="主旨" rules={[{ required: true }]}><Input /></Form.Item>
            <Row gutter={12}>
              <Col span={12}><Form.Item name="doc_date" label={docType === 'incoming' ? '收文日期' : '發文日期'} rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} format={rocPickerFormat} placeholder="民國年份" /></Form.Item></Col>
              <Col span={12}>
                <ManagedCategoryField name="category" label="分類" tab="doc_category" buttonText="管理分類">
                  <Select allowClear>{categories.map(c => <Option key={c} value={c}>{c}</Option>)}</Select>
                </ManagedCategoryField>
              </Col>
              <Col span={12}><Form.Item name="org_name" label={docType === 'incoming' ? '來文機關' : '受文機關'}><Input /></Form.Item></Col>
              {/* 使用 hidden 避免 unmount 造成資料丟失 */}
              <Col span={12} style={{ display: docType === 'incoming' ? undefined : 'none' }}>
                <Form.Item name="org_doc_number" label="來文字號" hidden={docType !== 'incoming'}><Input /></Form.Item>
              </Col>
              <Col span={12} style={{ display: docType === 'incoming' ? undefined : 'none' }}>
                <Form.Item name="org_doc_date" label="來文日期" hidden={docType !== 'incoming'}>
                  <DatePicker style={{ width: '100%' }} format={rocPickerFormat} placeholder="民國年份" />
                </Form.Item>
              </Col>
              <Col span={12}><Form.Item name="deadline" label="處理期限"><DatePicker style={{ width: '100%' }} format={rocPickerFormat} placeholder="民國年份" /></Form.Item></Col>
              <Col span={12}><Form.Item name="assignee_id" label="承辦人"><Select allowClear>{users.map(u => <Option key={u.id} value={u.id}>{u.name}</Option>)}</Select></Form.Item></Col>
            </Row>
          </FormSection>
          <FormSection title="內容與關聯" description="補上摘要與相關陳情，讓後續追蹤更完整。">
            <Form.Item
              name="content_summary"
              label={
                <Space>
                  <span>內容摘要</span>
                  <AIButton
                    label="AI 摘要"
                    size="small"
                    type="link"
                    tooltip="根據主旨用 AI 生成摘要草稿"
                    endpoint="/ai/summarize"
                    payload={{ text: form.getFieldValue('content_summary') || form.getFieldValue('subject') || '', type: 'general' }}
                    onResult={(d) => form.setFieldsValue({ content_summary: d.summary })}
                  />
                </Space>
              }
            >
              <TextArea rows={3} />
            </Form.Item>
            <Form.Item name="related_petition_id" label="關聯陳情">
              <Select
                showSearch allowClear placeholder="輸入案號或選民姓名搜尋"
                filterOption={false}
                onSearch={searchPetitions}
                notFoundContent={null}
              >
                {petitionOptions.map(p => (
                  <Option key={p.id} value={p.id}>
                    [{p.case_number}] {p.voter_name || '匿名'} — {p.content?.slice(0, 20)}
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </FormSection>
        </Form>
      </Drawer>

      {/* 公文詳情 */}
      <Drawer
        title={selectedDoc ? `${selectedDoc.doc_type === 'incoming' ? '收文' : '發文'}　${selectedDoc.doc_number}` : '公文詳情'}
        open={detailDrawerOpen}
        onClose={() => { setDetailDrawerOpen(false); transferForm.resetFields() }}
        width={600}
        extra={(canExportDocument || canDeleteDocument) ? (
          <Space>
            {canExportDocument && (
              <>
                <Button
                  icon={<PrinterOutlined />}
                  onClick={() => selectedDoc && printDocument(selectedDoc, officeName)}
                >
                  列印
                </Button>
                <Button
                  icon={<FileWordOutlined />}
                  onClick={() => selectedDoc && exportDocumentWord(selectedDoc, officeName, officeInfo)}
                >
                  匯出 Word
                </Button>
                <Button
                  icon={<FilePdfOutlined />}
                  onClick={async () => {
                    if (!selectedDoc) return
                    try {
                      const res = await api.get(`/documents/${selectedDoc.id}/export-pdf`, { responseType: 'blob' })
                      const url = URL.createObjectURL(res.data)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = `${selectedDoc.doc_number || '公文'}.pdf`
                      a.click()
                      URL.revokeObjectURL(url)
                    } catch (err: any) {
                      message.error(err.response?.data?.error || 'PDF 匯出失敗')
                    }
                  }}
                >
                  匯出 PDF
                </Button>
              </>
            )}
            {canDeleteDocument && (
              <Popconfirm
                title="確定刪除此公文？"
                description="刪除後將無法復原。"
                onConfirm={() => selectedDoc && handleDelete(selectedDoc.id)}
                okText="確定刪除"
                cancelText="取消"
                okButtonProps={{ danger: true }}
              >
                <Button danger icon={<DeleteOutlined />}>刪除</Button>
              </Popconfirm>
            )}
          </Space>
        ) : undefined}
      >
        {selectedDoc && (
          <>
          <Descriptions bordered column={2} size="small">
            <Descriptions.Item label="文號" span={2}>{selectedDoc.doc_number}</Descriptions.Item>
            <Descriptions.Item label={selectedDoc.doc_type === 'incoming' ? '來文機關' : '受文機關'}>{selectedDoc.org_name || '—'}</Descriptions.Item>
            <Descriptions.Item label="公文日期">{toROC(selectedDoc.doc_date)}</Descriptions.Item>
            {selectedDoc.doc_type === 'incoming' && <>
              <Descriptions.Item label="來文字號">{selectedDoc.org_doc_number || '—'}</Descriptions.Item>
              <Descriptions.Item label="來文日期">{toROC(selectedDoc.org_doc_date)}</Descriptions.Item>
            </>}
            <Descriptions.Item label="類別">{selectedDoc.category || '—'}</Descriptions.Item>
            <Descriptions.Item label="承辦人">{selectedDoc.assignee_name || '—'}</Descriptions.Item>
            <Descriptions.Item label="處理期限">
              {selectedDoc.deadline ? (
                <Text type={isOverdue(selectedDoc.deadline, selectedDoc.status) ? 'danger' : undefined}>
                  {toROC(selectedDoc.deadline)}
                  {isOverdue(selectedDoc.deadline, selectedDoc.status) && ' ⚠️ 已逾期'}
                </Text>
              ) : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="狀態">
              <Tag color={STATUS_COLORS[selectedDoc.status] || 'default'}>
                {STATUS_LABELS[selectedDoc.status] || FALLBACK_STATUS_LABEL}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="主旨" span={2}>
              <Space wrap>
                <span>{selectedDoc.subject}</span>
                <AIButton
                  label="AI 摘要"
                  size="small"
                  type="dashed"
                  tooltip="用 AI 整理公文重點"
                  endpoint="/ai/summarize"
                  payload={{ text: selectedDoc.content_summary || selectedDoc.subject, type: 'general' }}
                  onResult={(d) => message.info({ content: d.summary, duration: 10, icon: <RobotOutlined /> })}
                />
              </Space>
            </Descriptions.Item>
            {selectedDoc.content_summary && (
              <Descriptions.Item label="內容摘要" span={2}>
                <div style={{ whiteSpace: 'pre-wrap' }}>{selectedDoc.content_summary}</div>
              </Descriptions.Item>
            )}
          </Descriptions>

          {/* 移轉資訊 */}
          <Divider>移轉資訊</Divider>
          {canEditDocument ? (
            <Form form={transferForm} layout="vertical" onFinish={async (vals) => {
              try {
                await api.put(`/documents/${selectedDoc.id}`, {
                  transfer_to: vals.transfer_to,
                  transfer_date: vals.transfer_date ? dayjs(vals.transfer_date).format('YYYY-MM-DD') : undefined,
                  transfer_note: vals.transfer_note,
                  status: 'processing',
                })
                message.success('移轉資訊已更新')
                fetchDocs()
              } catch { message.error('更新失敗') }
            }}>
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name="transfer_to" label="移轉至">
                    <Input placeholder="機關/單位名稱" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="transfer_date" label="移轉日期">
                    <DatePicker style={{ width: '100%' }} format={rocPickerFormat} placeholder="民國年份" />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="transfer_note" label="移轉說明">
                <Input.TextArea rows={2} />
              </Form.Item>
              <Button type="primary" htmlType="submit" size="small">儲存移轉資訊</Button>
            </Form>
          ) : (
            <Descriptions bordered column={1} size="small">
              <Descriptions.Item label="移轉至">{selectedDoc.transfer_to || '—'}</Descriptions.Item>
              <Descriptions.Item label="移轉日期">{selectedDoc.transfer_date ? toROC(selectedDoc.transfer_date) : '—'}</Descriptions.Item>
              <Descriptions.Item label="移轉說明">{selectedDoc.transfer_note || '—'}</Descriptions.Item>
            </Descriptions>
          )}
          <Divider>附件</Divider>
          <AttachmentUpload refType="document" refId={selectedDoc.id} readonly={!canEditDocument} />
          </>
        )}
      </Drawer>
    </div>
  )
}

export default function DocumentListPage() {
  return (
    <PageScaffold
      eyebrow="Document Desk"
      title="公文管理"
      titleLevel={4}
      variant="compact"
      description="以收文/發文工作台管理文號、期限、承辦與附件流程。"
    >
      <Card>
        <Tabs defaultActiveKey="incoming" items={[
          { key: 'incoming', label: '收文管理', children: <DocTable docType="incoming" /> },
          { key: 'outgoing', label: '發文管理', children: <DocTable docType="outgoing" /> },
        ]} />
      </Card>
    </PageScaffold>
  )
}
