import React, { useState, useEffect } from 'react'
import { Table, Button, Space, Typography, Card, Tabs, Modal, Form, Input, message, Popconfirm, Switch, InputNumber, Tag, Tooltip } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, LockOutlined } from '@ant-design/icons'
import api from '../../utils/api'
import PageScaffold from '../../components/ui/PageScaffold'
import { useAuthStore } from '../../stores/authStore'
import { hasModulePermission } from '../../utils/permissions'
import { useSearchParams } from 'react-router-dom'

const { Text } = Typography

const TYPE_LABELS: Record<string, string> = {
  petition_category: '陳情類別',
  petition_area: '陳情區域',
  voter_tag: '選民標籤',
  group_category: '團體類別',
  doc_category: '公文分類',
}

const CATEGORY_TAB_KEYS = ['schedule_type', ...Object.keys(TYPE_LABELS), 'gift_category']

// ── 禮品類別 ─────────────────────────────────────────────────────
function GiftCategoryTable({ canManage }: { canManage: boolean }) {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<any>(null)
  const [form] = Form.useForm()

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await api.get('/gift-categories')
      setData(res.data.data || [])
    } catch {}
    finally { setLoading(false) }
  }

  const handleSave = async (values: any) => {
    try {
      if (editingItem) {
        await api.put(`/gift-categories/${editingItem.id}`, { ...editingItem, ...values })
        message.success('已更新')
      } else {
        await api.post('/gift-categories', values)
        message.success('已新增')
      }
      setModalOpen(false); form.resetFields(); setEditingItem(null); fetchData()
    } catch { message.error('操作失敗') }
  }

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/gift-categories/${id}`)
      message.success('已停用')
      fetchData()
    } catch { message.error('操作失敗') }
  }

  const columns = [
    { title: '類別名稱', dataIndex: 'name' },
    { title: '單位', dataIndex: 'unit', width: 70 },
    { title: '預設單價', dataIndex: 'default_price', width: 100, render: (v: number) => `NT$ ${v.toLocaleString()}` },
    { title: '排序', dataIndex: 'sort_order', width: 60 },
    {
      title: '操作', width: 100,
      render: (_: any, r: any) => (
        <Space>
          {canManage ? (
            <>
              <Button size="small" icon={<EditOutlined />} onClick={() => { setEditingItem(r); form.setFieldsValue(r); setModalOpen(true) }} />
              <Popconfirm title="確定停用此類別？" onConfirm={() => handleDelete(r.id)}>
                <Button size="small" icon={<DeleteOutlined />} danger />
              </Popconfirm>
            </>
          ) : (
            <Text type="secondary">唯讀</Text>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div>
      {canManage && (
        <div style={{ marginBottom: 12, textAlign: 'right' }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingItem(null); form.resetFields(); setModalOpen(true) }}>新增</Button>
        </div>
      )}
      <Table columns={columns} dataSource={data} rowKey="id" loading={loading} size="small" pagination={false} />
      {canManage && (
        <Modal title={editingItem ? '編輯禮品類別' : '新增禮品類別'} open={modalOpen}
          onCancel={() => { setModalOpen(false); form.resetFields(); setEditingItem(null) }}
          onOk={() => form.submit()} okText="儲存" destroyOnClose>
          <Form form={form} layout="vertical" onFinish={handleSave}>
            <Form.Item name="name" label="類別名稱" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="unit" label="單位" initialValue="份"><Input placeholder="個 / 束 / 份 / 包" /></Form.Item>
            <Form.Item name="default_price" label="預設單價（NT$）" initialValue={0}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="sort_order" label="排序（數字越小越前面）"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
          </Form>
        </Modal>
      )}
    </div>
  )
}

// ── 行程類型 ─────────────────────────────────────────────────────
function ScheduleTypeTable({ canManage }: { canManage: boolean }) {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<any>(null)
  const [form] = Form.useForm()

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await api.get('/admin/categories?type=schedule_type')
      setData(res.data.data || [])
    } catch {}
    finally { setLoading(false) }
  }

  const handleSave = async (values: any) => {
    try {
      // Auto-generate code for new items if not provided
      const code = values.code?.trim() || values.name.trim()
        .toLowerCase()
        .replace(/[\s\u4e00-\u9fa5]+/g, '_')
        .replace(/[^a-z0-9_]/g, '') || `type_${Date.now()}`

      if (editingItem) {
        await api.put(`/admin/categories/${editingItem.id}`, {
          name: values.name, sort_order: values.sort_order ?? 0,
          is_active: editingItem.is_active ?? 1, color: values.color || '#8c8c8c',
          code: editingItem.code ?? code,
        })
        message.success('已更新')
      } else {
        await api.post('/admin/categories', {
          type: 'schedule_type', name: values.name,
          sort_order: values.sort_order ?? 0,
          color: values.color || '#8c8c8c', code,
        })
        message.success('已新增')
      }
      setModalOpen(false); form.resetFields(); setEditingItem(null); fetchData()
    } catch (err: any) { message.error(err.response?.data?.error || '操作失敗') }
  }

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/admin/categories/${id}`)
      message.success('已刪除')
      fetchData()
    } catch (err: any) { message.error(err.response?.data?.error || '刪除失敗') }
  }

  const currentColor = Form.useWatch('color', form)

  const COLOR_PRESETS = [
    '#007AFF','#52c41a','#fa8c16','#722ed1','#13c2c2',
    '#36cfc9','#fa541c','#f759ab','#4a1942','#8c8c8c',
    '#faad14','#eb2f96','#1890ff','#d4b106','#595959',
  ]

  const columns = [
    {
      title: '名稱', dataIndex: 'name',
      render: (name: string, r: any) => (
        <Space>
          <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', background: r.color || '#8c8c8c', flexShrink: 0 }} />
          <Text>{name}</Text>
          {r.is_protected ? <Tooltip title="系統保護，無法刪除"><LockOutlined style={{ color: '#faad14', fontSize: 12 }} /></Tooltip> : null}
        </Space>
      ),
    },
    {
      title: '代碼', dataIndex: 'code', width: 130,
      render: (v: string) => <Tag style={{ fontFamily: 'monospace' }}>{v}</Tag>
    },
    {
      title: '顏色', dataIndex: 'color', width: 70,
      render: (v: string) => (
        <span style={{ display: 'inline-block', width: 24, height: 24, borderRadius: 4, background: v || '#8c8c8c', border: '1px solid #ddd' }} />
      ),
    },
    { title: '排序', dataIndex: 'sort_order', width: 60 },
    {
      title: '啟用', dataIndex: 'is_active', width: 70,
      render: (v: number, r: any) => (
        <Switch checked={!!v} size="small" disabled={!canManage || !!r.is_protected} onChange={async (checked) => {
          await api.put(`/admin/categories/${r.id}`, { ...r, is_active: checked ? 1 : 0 })
          fetchData()
        }} />
      ),
    },
    {
      title: '操作', width: 90,
      render: (_: any, r: any) => (
        <Space>
          {canManage ? (
            <>
              <Button size="small" icon={<EditOutlined />} onClick={() => { setEditingItem(r); form.setFieldsValue({ name: r.name, sort_order: r.sort_order, color: r.color }); setModalOpen(true) }} />
              {r.is_protected
                ? <Tooltip title="公祭為系統保護類型"><Button size="small" icon={<DeleteOutlined />} disabled /></Tooltip>
                : (
                  <Popconfirm title="確定刪除此行程類型？" onConfirm={() => handleDelete(r.id)}>
                    <Button size="small" icon={<DeleteOutlined />} danger />
                  </Popconfirm>
                )
              }
            </>
          ) : (
            <Text type="secondary">唯讀</Text>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text type="secondary" style={{ fontSize: 12 }}>🔒 公祭為系統保護類型，無法刪除</Text>
        {canManage ? (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingItem(null); form.resetFields(); setModalOpen(true) }}>新增類型</Button>
        ) : null}
      </div>
      <Table columns={columns} dataSource={data} rowKey="id" loading={loading} size="small" pagination={false} />
      {canManage && (
        <Modal
          title={editingItem ? `編輯：${editingItem.name}` : '新增行程類型'}
          open={modalOpen}
          onCancel={() => { setModalOpen(false); form.resetFields(); setEditingItem(null) }}
          onOk={() => form.submit()} okText="儲存" destroyOnClose
        >
          <Form form={form} layout="vertical" onFinish={handleSave}>
            <Form.Item name="name" label="類型名稱" rules={[{ required: true, message: '請輸入名稱' }]}>
              <Input placeholder="如：座談會、走訪" />
            </Form.Item>
            <Form.Item name="color" label="行事曆顏色" initialValue="#8c8c8c">
              <Input placeholder="#007AFF" maxLength={7} style={{ width: 120 }} />
            </Form.Item>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
              {COLOR_PRESETS.map(c => (
                <div key={c} onClick={() => form.setFieldValue('color', c)}
                  style={{ width: 24, height: 24, borderRadius: 4, background: c, cursor: 'pointer', border: '2px solid transparent',
                    boxShadow: currentColor === c ? '0 0 0 2px #1677ff' : undefined }} />
              ))}
            </div>
            <Form.Item name="sort_order" label="排序（數字越小越前面）" initialValue={99}>
              <InputNumber min={0} max={999} style={{ width: '100%' }} />
            </Form.Item>
          </Form>
        </Modal>
      )}
    </div>
  )
}

// ── 一般類別表 ─────────────────────────────────────────────────────
function CategoryTable({ type, canManage }: { type: string; canManage: boolean }) {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<any>(null)
  const [form] = Form.useForm()

  useEffect(() => { fetchCategories() }, [])

  const fetchCategories = async () => {
    setLoading(true)
    try {
      const res = await api.get(`/admin/categories?type=${type}`)
      setData(res.data.data || [])
    } catch {}
    finally { setLoading(false) }
  }

  const handleSave = async (values: any) => {
    try {
      if (editingItem) {
        await api.put(`/admin/categories/${editingItem.id}`, { ...values, type })
        message.success('已更新')
      } else {
        await api.post('/admin/categories', { ...values, type })
        message.success('已新增')
      }
      setModalOpen(false); form.resetFields(); setEditingItem(null); fetchCategories()
    } catch (err: any) { message.error(err.response?.data?.error || '操作失敗') }
  }

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/admin/categories/${id}`)
      message.success('已刪除')
      fetchCategories()
    } catch { message.error('刪除失敗') }
  }

  const columns = [
    { title: '名稱', dataIndex: 'name' },
    { title: '排序', dataIndex: 'sort_order', width: 60 },
    {
      title: '狀態', dataIndex: 'is_active', width: 80,
      render: (active: number, r: any) => (
        <Switch checked={!!active} size="small" disabled={!canManage} onChange={async (v) => {
          await api.put(`/admin/categories/${r.id}`, { ...r, is_active: v ? 1 : 0 })
          fetchCategories()
        }} />
      ),
    },
    {
      title: '操作', width: 100,
      render: (_: any, r: any) => (
        <Space>
          {canManage ? (
            <>
              <Button size="small" icon={<EditOutlined />} onClick={() => { setEditingItem(r); form.setFieldsValue(r); setModalOpen(true) }} />
              <Popconfirm title="確定刪除？" onConfirm={() => handleDelete(r.id)}>
                <Button size="small" icon={<DeleteOutlined />} danger />
              </Popconfirm>
            </>
          ) : (
            <Text type="secondary">唯讀</Text>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div>
      {canManage && (
        <div style={{ marginBottom: 12, textAlign: 'right' }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingItem(null); form.resetFields(); setModalOpen(true) }}>新增</Button>
        </div>
      )}
      <Table columns={columns} dataSource={data} rowKey="id" loading={loading} size="small" pagination={false} />
      {canManage && (
        <Modal title={editingItem ? '編輯類別' : '新增類別'} open={modalOpen}
          onCancel={() => { setModalOpen(false); setEditingItem(null) }} onOk={() => form.submit()} okText="儲存" cancelText="取消" destroyOnClose>
          <Form form={form} layout="vertical" onFinish={handleSave}>
            <Form.Item name="name" label="名稱" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="sort_order" label="排序（數字越小越前面）"><Input type="number" /></Form.Item>
          </Form>
        </Modal>
      )}
    </div>
  )
}

// ── 主頁 ──────────────────────────────────────────────────────────
export default function CategoryPage() {
  const { user } = useAuthStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab') || searchParams.get('type') || ''
  const activeTab = CATEGORY_TAB_KEYS.includes(requestedTab) ? requestedTab : 'schedule_type'
  const canManageCategories =
    hasModulePermission(user?.role, 'categories', 'create') ||
    hasModulePermission(user?.role, 'categories', 'edit') ||
    hasModulePermission(user?.role, 'categories', 'delete')

  const handleTabChange = (key: string) => {
    setSearchParams(key === 'schedule_type' ? {} : { tab: key }, { replace: true })
  }

  return (
    <PageScaffold
      eyebrow="Taxonomy Studio"
      title="類別管理"
      titleLevel={4}
      variant="compact"
      description={canManageCategories
        ? '維護行程、陳情、選民標籤、公文與禮品分類，讓資料口徑一致。'
        : '目前以唯讀模式查看系統類別定義，確保填報口徑一致。'}
    >
      <Card>
        <Tabs activeKey={activeTab} onChange={handleTabChange} items={[
          { key: 'schedule_type', label: '行程類型', children: <ScheduleTypeTable canManage={canManageCategories} /> },
          ...Object.entries(TYPE_LABELS).map(([key, label]) => ({
            key, label, children: <CategoryTable type={key} canManage={canManageCategories} />,
          })),
          { key: 'gift_category', label: '禮品類別', children: <GiftCategoryTable canManage={canManageCategories} /> },
        ]} />
      </Card>
    </PageScaffold>
  )
}
