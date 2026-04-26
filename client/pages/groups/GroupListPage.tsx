import React, { useState, useEffect } from 'react'
import { Table, Button, Space, Input, Select, Tag, Typography, Card, Drawer, Form, message, Popconfirm, Row, Col, Modal, Upload, Alert } from 'antd'
import { PlusOutlined, SearchOutlined, EyeOutlined, EditOutlined, DeleteOutlined, UploadOutlined, DownloadOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import api from '../../utils/api'
import PageScaffold from '../../components/ui/PageScaffold'
import WorkspaceToolbar from '../../components/ui/WorkspaceToolbar'
import FormFooter from '../../components/ui/FormFooter'
import FormSection from '../../components/ui/FormSection'
import dayjs from 'dayjs'
import type { ColumnsType } from 'antd/es/table'

const { Text } = Typography
const { Option } = Select

export default function GroupListPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingGroup, setEditingGroup] = useState<any>(null)
  const [form] = Form.useForm()
  const [categories, setCategories] = useState<string[]>([])
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { fetchCategories() }, [])
  useEffect(() => { fetchGroups() }, [page, search, filterCategory])

  const fetchCategories = async () => {
    try {
      const res = await api.get('/admin/categories?type=group_category')
      setCategories(res.data.data?.map((c: any) => c.name) || [])
    } catch (err: any) {
      setError(err?.response?.data?.error || '載入團體類別失敗，篩選選項可能不完整。')
    }
  }

  const fetchGroups = async () => {
    setLoading(true)
    setError(null)
    try {
      const params: any = { page, pageSize }
      if (search) params.search = search
      if (filterCategory) params.category = filterCategory
      const res = await api.get('/groups', { params })
      setData(res.data.data || [])
      setTotal(res.data.total || 0)
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || '載入團體資料失敗，請重試')
    }
    finally { setLoading(false) }
  }

  const handleSave = async (values: any) => {
    try {
      if (editingGroup) {
        await api.put(`/groups/${editingGroup.id}`, values)
        message.success('團體已更新')
      } else {
        await api.post('/groups', values)
        message.success('團體已建立')
      }
      setDrawerOpen(false); form.resetFields(); setEditingGroup(null); fetchGroups()
    } catch (err: any) { message.error(err.response?.data?.error || '儲存失敗') }
  }

  const handleDownloadTemplate = async () => {
    try {
      const res = await api.get('/groups/import/template', { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url; a.download = 'group_import_template.xlsx'; a.click()
      URL.revokeObjectURL(url)
    } catch { message.error('下載範本失敗') }
  }

  const handleImportFile = async (file: File) => {
    setImporting(true); setImportResult(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await api.post('/groups/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      setImportResult(res.data)
      if (res.data.imported > 0) fetchGroups()
    } catch { message.error('匯入失敗') }
    finally { setImporting(false) }
    return false
  }

  const handleDelete = async (id: number, name: string) => {
    try {
      await api.delete(`/groups/${id}`)
      message.success(`已停用「${name}」`)
      fetchGroups()
    } catch { message.error('操作失敗') }
  }

  const columns: ColumnsType<any> = [
    { title: '團體名稱', dataIndex: 'name', render: (n, r) => <Button type="link" onClick={() => navigate(`/groups/${r.id}`)}>{n}</Button> },
    { title: '類別', dataIndex: 'category', render: c => c ? <Tag>{c}</Tag> : '-' },
    { title: '電話', dataIndex: 'phone', width: 120 },
    { title: '地址', dataIndex: 'address', ellipsis: true },
    { title: '建立日期', dataIndex: 'created_at', width: 100, render: d => dayjs(d).format('YYYY-MM-DD') },
    {
      title: '操作', width: 100,
      render: (_, r) => (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => navigate(`/groups/${r.id}`)} />
          <Button size="small" icon={<EditOutlined />} onClick={() => { setEditingGroup(r); form.setFieldsValue(r); setDrawerOpen(true) }} />
          <Popconfirm title={`確定停用「${r.name}」？`} onConfirm={() => handleDelete(r.id, r.name)}>
            <Button size="small" icon={<DeleteOutlined />} danger />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <PageScaffold
      eyebrow="Community Graph"
      title="團體資料"
      titleLevel={4}
      variant="compact"
      description="管理社區組織、團體類別與成員來源，建立服務網絡。"
      actions={
        <>
          <Button icon={<UploadOutlined />} onClick={() => { setImportResult(null); setImportModalOpen(true) }}>批量匯入</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingGroup(null); form.resetFields(); setDrawerOpen(true) }}>新增團體</Button>
        </>
      }
    >
      <WorkspaceToolbar
        title="團體篩選"
        description="搜尋團體名稱或依類別聚焦社群網絡。"
        meta={<Text type="secondary">共 {total} 筆</Text>}
      >
        <Space wrap>
          <Input.Search placeholder="搜尋團體名稱" allowClear style={{ width: 200 }} onSearch={(v) => { setSearch(v); setPage(1) }} prefix={<SearchOutlined />} />
          <Select placeholder="類別篩選" allowClear style={{ width: 150 }} onChange={(v) => { setFilterCategory(v || ''); setPage(1) }}>
            {categories.map(c => <Option key={c} value={c}>{c}</Option>)}
          </Select>
        </Space>
      </WorkspaceToolbar>
      {error && (
        <Alert
          type="error"
          showIcon
          closable
          message={error}
          action={<Button size="small" onClick={() => { fetchCategories(); fetchGroups() }}>重試</Button>}
          style={{ marginBottom: 12 }}
          onClose={() => setError(null)}
        />
      )}
      <Card>
        <Table columns={columns} dataSource={data} rowKey="id" loading={loading} size="small"
          pagination={{ current: page, pageSize, total, showTotal: t => `共 ${t} 筆`, onChange: setPage }} scroll={{ x: 800 }} />
      </Card>
      <Drawer title={editingGroup ? '編輯團體' : '新增團體'} open={drawerOpen} onClose={() => setDrawerOpen(false)} width={500}
        destroyOnClose
        footer={<FormFooter onCancel={() => setDrawerOpen(false)} onSubmit={() => form.submit()} />}>
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <FormSection title="團體基本資料" description="先建立團體名稱、分類與聯絡方式，後續可再管理成員。">
            <Form.Item name="name" label="團體名稱" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="category" label="團體類別">
              <Select allowClear>{categories.map(c => <Option key={c} value={c}>{c}</Option>)}</Select>
            </Form.Item>
            <Row gutter={12}>
              <Col span={12}><Form.Item name="phone" label="聯絡電話"><Input /></Form.Item></Col>
              <Col span={12}><Form.Item name="member_count" label="預估成員數"><Input type="number" /></Form.Item></Col>
            </Row>
            <Form.Item name="address" label="地址"><Input /></Form.Item>
            <Form.Item name="note" label="備註"><Input.TextArea rows={3} /></Form.Item>
          </FormSection>
        </Form>
      </Drawer>
      {/* 批量匯入 Modal */}
      <Modal
        title="批量匯入團體"
        open={importModalOpen}
        onCancel={() => setImportModalOpen(false)}
        footer={null}
        width={460}
        destroyOnClose
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Alert type="info" showIcon message="請先下載範本，依格式填寫後上傳" description="支援欄位：團體名稱、類別、聯絡電話、地址、預估成員數、備註" />
          <Button icon={<DownloadOutlined />} onClick={handleDownloadTemplate} block>下載 Excel 範本</Button>
          <Upload.Dragger accept=".xlsx,.xls" beforeUpload={handleImportFile} showUploadList={false} disabled={importing}>
            <p className="ant-upload-drag-icon"><UploadOutlined /></p>
            <p className="ant-upload-text">點擊或拖曳 Excel 檔案至此上傳</p>
            <p className="ant-upload-hint">僅支援 .xlsx / .xls 格式</p>
          </Upload.Dragger>
          {importing && <div style={{ textAlign: 'center' }}>匯入中，請稍候...</div>}
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
    </PageScaffold>
  )
}
