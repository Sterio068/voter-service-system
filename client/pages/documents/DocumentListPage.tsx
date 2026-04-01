import React, { useState, useEffect } from 'react'
import AttachmentUpload from '../../components/AttachmentUpload'
import { Table, Button, Space, Input, Select, Tag, Typography, Card, Drawer, Form, DatePicker, message, Tabs, Row, Col, Divider, Descriptions, Empty, Popconfirm } from 'antd'
import { PlusOutlined, SearchOutlined, PrinterOutlined, FileWordOutlined, EyeOutlined, FilterOutlined, DeleteOutlined } from '@ant-design/icons'
import api from '../../utils/api'
import dayjs from 'dayjs'
import type { ColumnsType } from 'antd/es/table'

const { Title, Text } = Typography
const { Option } = Select
const { TextArea } = Input

const STATUS_COLORS: Record<string, string> = { pending: 'orange', processing: 'blue', replied: 'cyan', archived: 'default' }
const STATUS_LABELS: Record<string, string> = { pending: '待處理', processing: '處理中', replied: '已回覆', archived: '已歸檔' }

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

function exportDocumentWord(doc: any, officeName: string) {
  const isIncoming = doc.doc_type === 'incoming'
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
  margin: 2.5cm 2.5cm 2cm 3cm;
  mso-page-orientation: portrait;
}
body {
  font-family: "標楷體", "DFKai-SB", "BiauKai", serif;
  font-size: 14pt;
  line-height: 200%;
  color: #000000;
  margin: 0;
}
table {
  border-collapse: collapse;
  width: 100%;
}
.outer {
  border: 2pt solid #000000;
  width: 100%;
}
.outer td {
  padding: 4pt 8pt;
  vertical-align: top;
}
.agency {
  font-size: 20pt;
  font-weight: bold;
  text-align: center;
  letter-spacing: 6pt;
  padding: 8pt 4pt;
  border-bottom: 2pt solid #000000;
}
.speed-row {
  border-bottom: 1pt solid #000000;
  font-size: 12pt;
}
.field-label {
  font-weight: bold;
  white-space: nowrap;
}
.mid-row {
  border-bottom: 1pt solid #000000;
}
.section-row {
  border-bottom: 1pt solid #000000;
  padding: 6pt 8pt;
}
.sign-area {
  text-align: right;
  font-size: 14pt;
  line-height: 250%;
  padding-top: 12pt;
}
.copy-area {
  font-size: 12pt;
  border-top: 1pt solid #000000;
  margin-top: 8pt;
  padding-top: 4pt;
  line-height: 180%;
}
</style>
</head>
<body>
<table class="outer">
  <tr>
    <td colspan="4" class="agency">${officeName}</td>
  </tr>
  <tr class="speed-row">
    <td width="25%"><span class="field-label">速　　別：</span>普通件</td>
    <td width="25%"><span class="field-label">密　　等：</span>普通</td>
    <td width="25%">&nbsp;</td>
    <td width="25%">&nbsp;</td>
  </tr>
  <tr class="mid-row">
    <td colspan="2"><span class="field-label">${isIncoming ? '來文機關' : '受　文　者'}：</span>${doc.org_name || '　　　　'}</td>
    <td><span class="field-label">發文日期：</span>${toROC(doc.doc_date)}</td>
    <td><span class="field-label">發文字號：</span>${doc.doc_number}</td>
  </tr>
  ${isIncoming ? `
  <tr class="mid-row">
    <td><span class="field-label">來文字號：</span>${doc.org_doc_number || '　　　　'}</td>
    <td><span class="field-label">來文日期：</span>${toROC(doc.org_doc_date)}</td>
    <td><span class="field-label">承　辦　人：</span>${doc.assignee_name || '　　'}</td>
    <td><span class="field-label">類　　別：</span>${doc.category || '　　'}</td>
  </tr>` : `
  <tr class="mid-row">
    <td><span class="field-label">承　辦　人：</span>${doc.assignee_name || '　　'}</td>
    <td><span class="field-label">類　　別：</span>${doc.category || '　　'}</td>
    <td colspan="2"><span class="field-label">附　　　件：</span></td>
  </tr>`}
  <tr>
    <td colspan="4" class="section-row">
      <span class="field-label">主　　　旨：</span>${doc.subject || ''}。
    </td>
  </tr>
  ${doc.content_summary ? `
  <tr>
    <td colspan="4" class="section-row">
      <div><span class="field-label">說　　　明：</span></div>
      <div style="margin-left:2em; white-space:pre-wrap; line-height:200%;">${doc.content_summary.replace(/\n/g, '<br>')}</div>
    </td>
  </tr>` : ''}
  <tr>
    <td colspan="4" style="padding: 12pt 8pt;">
      <div class="sign-area">
        ${officeName}<br>
        機關首長：________________<br>
        &nbsp;
      </div>
      <div class="copy-area">
        正　　本：${isIncoming ? (doc.org_name || '（來文機關）') : '（受文者）'}<br>
        副　　本：
      </div>
    </td>
  </tr>
</table>
</body>
</html>`

  const blob = new Blob(['\ufeff' + html], { type: 'application/msword' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${doc.doc_number}.doc`
  a.click()
  URL.revokeObjectURL(url)
}

function DocTable({ docType }: { docType: 'incoming' | 'outgoing' }) {
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
  const [petitionOptions, setPetitionOptions] = useState<any[]>([])

  useEffect(() => {
    api.get('/users/list').then(r => setUsers(r.data.data || [])).catch(() => {})
    api.get('/admin/categories?type=doc_category').then(r => setCategories(r.data.data?.map((c: any) => c.name) || [])).catch(() => {})
    api.get('/admin/settings').then(r => { if (r.data.data?.office_name) setOfficeName(r.data.data.office_name) }).catch(() => {})
  }, [])

  const searchPetitions = async (val: string) => {
    if (!val || val.length < 1) return
    try {
      const res = await api.get(`/petitions?search=${encodeURIComponent(val)}&pageSize=10`)
      setPetitionOptions(res.data.data || [])
    } catch {}
  }

  useEffect(() => { fetchDocs() }, [page, filterStatus, search])

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
      render: (s) => <Tag color={STATUS_COLORS[s]}>{STATUS_LABELS[s]}</Tag>,
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
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
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
          <Text type="secondary">共 {total} 筆</Text>
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setDrawerOpen(true) }}>
          新增{docType === 'incoming' ? '收文' : '發文'}
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={loading}
        size="small"
        locale={{
          emptyText: (search || filterStatus)
            ? <Empty description="查無符合條件的資料" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            : <Empty description="尚無資料" image={Empty.PRESENTED_IMAGE_SIMPLE} />,
        }}
        onRow={(r) => ({ onClick: () => handleRowClick(r), style: { cursor: 'pointer' } })}
        pagination={{ current: page, pageSize: 20, total, showTotal: t => `共 ${t} 筆`, onChange: setPage }}
        scroll={{ x: 800 }}
      />

      {/* 新增公文 */}
      <Drawer title={`新增${docType === 'incoming' ? '收文' : '發文'}`} open={drawerOpen}
        onClose={() => setDrawerOpen(false)} width={560}
        destroyOnClose
        footer={<Space><Button onClick={() => setDrawerOpen(false)}>取消</Button><Button type="primary" onClick={() => form.submit()}>儲存</Button></Space>}>
        <Form form={form} layout="vertical" onFinish={handleSave} initialValues={{ doc_date: dayjs() }}>
          <Form.Item name="subject" label="主旨" rules={[{ required: true }]}><Input /></Form.Item>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="doc_date" label={docType === 'incoming' ? '收文日期' : '發文日期'} rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} format={rocPickerFormat} placeholder="民國年份" /></Form.Item></Col>
            <Col span={12}><Form.Item name="category" label="分類"><Select allowClear>{categories.map(c => <Option key={c} value={c}>{c}</Option>)}</Select></Form.Item></Col>
            <Col span={12}><Form.Item name="org_name" label={docType === 'incoming' ? '來文機關' : '受文機關'}><Input /></Form.Item></Col>
            {docType === 'incoming' && <><Col span={12}><Form.Item name="org_doc_number" label="來文字號"><Input /></Form.Item></Col>
              <Col span={12}><Form.Item name="org_doc_date" label="來文日期"><DatePicker style={{ width: '100%' }} format={rocPickerFormat} placeholder="民國年份" /></Form.Item></Col></>}
            <Col span={12}><Form.Item name="deadline" label="處理期限"><DatePicker style={{ width: '100%' }} format={rocPickerFormat} placeholder="民國年份" /></Form.Item></Col>
            <Col span={12}><Form.Item name="assignee_id" label="承辦人"><Select allowClear>{users.map(u => <Option key={u.id} value={u.id}>{u.name}</Option>)}</Select></Form.Item></Col>
          </Row>
          <Form.Item name="content_summary" label="內容摘要"><TextArea rows={3} /></Form.Item>
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
        </Form>
      </Drawer>

      {/* 公文詳情 */}
      <Drawer
        title={selectedDoc ? `${selectedDoc.doc_type === 'incoming' ? '收文' : '發文'}　${selectedDoc.doc_number}` : '公文詳情'}
        open={detailDrawerOpen}
        onClose={() => setDetailDrawerOpen(false)}
        width={600}
        extra={
          <Space>
            <Button
              icon={<PrinterOutlined />}
              onClick={() => selectedDoc && printDocument(selectedDoc, officeName)}
            >
              列印
            </Button>
            <Button
              icon={<FileWordOutlined />}
              onClick={() => selectedDoc && exportDocumentWord(selectedDoc, officeName)}
            >
              匯出 Word
            </Button>
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
          </Space>
        }
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
              <Tag color={STATUS_COLORS[selectedDoc.status]}>{STATUS_LABELS[selectedDoc.status]}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="主旨" span={2}>{selectedDoc.subject}</Descriptions.Item>
            {selectedDoc.content_summary && (
              <Descriptions.Item label="內容摘要" span={2}>
                <div style={{ whiteSpace: 'pre-wrap' }}>{selectedDoc.content_summary}</div>
              </Descriptions.Item>
            )}
          </Descriptions>

          {/* 移轉資訊 */}
          <Divider>移轉資訊</Divider>
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
                <Form.Item name="transfer_to" label="移轉至" initialValue={selectedDoc?.transfer_to}>
                  <Input placeholder="機關/單位名稱" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="transfer_date" label="移轉日期">
                  <DatePicker style={{ width: '100%' }} format={rocPickerFormat} placeholder="民國年份" defaultValue={selectedDoc?.transfer_date ? dayjs(selectedDoc.transfer_date) : undefined} />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="transfer_note" label="移轉說明" initialValue={selectedDoc?.transfer_note}>
              <Input.TextArea rows={2} />
            </Form.Item>
            <Button type="primary" htmlType="submit" size="small">儲存移轉資訊</Button>
          </Form>
          <Divider>附件</Divider>
          <AttachmentUpload refType="document" refId={selectedDoc.id} />
          </>
        )}
      </Drawer>
    </div>
  )
}

export default function DocumentListPage() {
  return (
    <div>
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>📮 公文管理</Title>
      </div>
      <Card>
        <Tabs defaultActiveKey="incoming" items={[
          { key: 'incoming', label: '收文管理', children: <DocTable docType="incoming" /> },
          { key: 'outgoing', label: '發文管理', children: <DocTable docType="outgoing" /> },
        ]} />
      </Card>
    </div>
  )
}
