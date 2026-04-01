import React, { useState, useEffect } from 'react'
import { Table, Button, Space, Typography, Card, Tabs, Modal, Form, Input, message, Popconfirm, Switch } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import api from '../../utils/api'

const { Title } = Typography

const TYPE_LABELS: Record<string, string> = {
  petition_category: '陳情類別',
  petition_area: '陳情區域',
  voter_tag: '選民標籤',
  group_category: '團體類別',
  doc_category: '公文分類',
}

function CategoryTable({ type }: { type: string }) {
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
        <Switch checked={!!active} size="small" onChange={async (v) => {
          await api.put(`/admin/categories/${r.id}`, { ...r, is_active: v ? 1 : 0 })
          fetchCategories()
        }} />
      ),
    },
    {
      title: '操作', width: 100,
      render: (_: any, r: any) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => { setEditingItem(r); form.setFieldsValue(r); setModalOpen(true) }} />
          <Popconfirm title="確定刪除？" onConfirm={() => handleDelete(r.id)}>
            <Button size="small" icon={<DeleteOutlined />} danger />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ marginBottom: 12, textAlign: 'right' }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingItem(null); form.resetFields(); setModalOpen(true) }}>
          新增
        </Button>
      </div>
      <Table columns={columns} dataSource={data} rowKey="id" loading={loading} size="small" pagination={false} />
      <Modal title={editingItem ? '編輯類別' : '新增類別'} open={modalOpen}
        onCancel={() => setModalOpen(false)} onOk={() => form.submit()} okText="儲存" cancelText="取消" destroyOnClose>
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="name" label="名稱" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="sort_order" label="排序（數字越小越前面）"><Input type="number" /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default function CategoryPage() {
  return (
    <div>
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>🏷️ 類別管理</Title>
      </div>
      <Card>
        <Tabs defaultActiveKey="petition_category" items={
          Object.entries(TYPE_LABELS).map(([key, label]) => ({
            key, label, children: <CategoryTable type={key} />,
          }))
        } />
      </Card>
    </div>
  )
}
