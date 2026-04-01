import React, { useState, useEffect } from 'react'
import { Table, Button, Space, Input, Select, Tag, Typography, Card, Drawer, Form, message, Popconfirm, Row, Col } from 'antd'
import { PlusOutlined, SearchOutlined, EyeOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import api from '../../utils/api'
import dayjs from 'dayjs'
import type { ColumnsType } from 'antd/es/table'

const { Title, Text } = Typography
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

  useEffect(() => { fetchCategories() }, [])
  useEffect(() => { fetchGroups() }, [page, search, filterCategory])

  const fetchCategories = async () => {
    try {
      const res = await api.get('/admin/categories?type=group_category')
      setCategories(res.data.data?.map((c: any) => c.name) || [])
    } catch {}
  }

  const fetchGroups = async () => {
    setLoading(true)
    try {
      const params: any = { page, pageSize }
      if (search) params.search = search
      if (filterCategory) params.category = filterCategory
      const res = await api.get('/groups', { params })
      setData(res.data.data || [])
      setTotal(res.data.total || 0)
    } catch { message.error('載入失敗') }
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
    <div>
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>🏢 團體資料</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingGroup(null); form.resetFields(); setDrawerOpen(true) }}>新增團體</Button>
      </div>
      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input.Search placeholder="搜尋團體名稱" allowClear style={{ width: 200 }} onSearch={(v) => { setSearch(v); setPage(1) }} prefix={<SearchOutlined />} />
          <Select placeholder="類別篩選" allowClear style={{ width: 150 }} onChange={(v) => { setFilterCategory(v || ''); setPage(1) }}>
            {categories.map(c => <Option key={c} value={c}>{c}</Option>)}
          </Select>
          <Text type="secondary">共 {total} 筆</Text>
        </Space>
      </Card>
      <Card>
        <Table columns={columns} dataSource={data} rowKey="id" loading={loading} size="small"
          pagination={{ current: page, pageSize, total, showTotal: t => `共 ${t} 筆`, onChange: setPage }} scroll={{ x: 800 }} />
      </Card>
      <Drawer title={editingGroup ? '編輯團體' : '新增團體'} open={drawerOpen} onClose={() => setDrawerOpen(false)} width={500}
        destroyOnClose
        footer={<Space><Button onClick={() => setDrawerOpen(false)}>取消</Button><Button type="primary" onClick={() => form.submit()}>儲存</Button></Space>}>
        <Form form={form} layout="vertical" onFinish={handleSave}>
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
        </Form>
      </Drawer>
    </div>
  )
}
