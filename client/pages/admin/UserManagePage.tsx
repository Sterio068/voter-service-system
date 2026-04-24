import React, { useState, useEffect } from 'react'
import { Table, Button, Space, Tag, Card, Modal, Form, Input, Select, message, Switch } from 'antd'
import { PlusOutlined, EditOutlined, KeyOutlined } from '@ant-design/icons'
import api from '../../utils/api'
import { ROLE_LABELS, ROLE_COLORS } from '../../utils/constants'
import PageScaffold from '../../components/ui/PageScaffold'
import dayjs from 'dayjs'

const { Option } = Select

export default function UserManagePage() {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [pwdModalOpen, setPwdModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<any>(null)
  const [form] = Form.useForm()
  const [pwdForm] = Form.useForm()

  useEffect(() => { fetchUsers() }, [])

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const res = await api.get('/admin/users')
      setData(res.data.data || [])
    } catch { message.error('載入失敗') }
    finally { setLoading(false) }
  }

  const handleSave = async (values: any) => {
    try {
      if (editingUser) {
        await api.put(`/admin/users/${editingUser.id}`, values)
        message.success('使用者已更新')
      } else {
        await api.post('/admin/users', values)
        message.success('使用者已建立')
      }
      setModalOpen(false); form.resetFields(); setEditingUser(null); fetchUsers()
    } catch (err: any) { message.error(err.response?.data?.error || '操作失敗') }
  }

  const handleResetPassword = async (values: any) => {
    try {
      await api.put(`/admin/users/${editingUser.id}/password`, values)
      message.success('密碼已重設')
      setPwdModalOpen(false); pwdForm.resetFields()
    } catch (err: any) { message.error(err.response?.data?.error || '操作失敗') }
  }

  const handleToggleActive = async (user: any) => {
    try {
      await api.put(`/admin/users/${user.id}`, { is_active: user.is_active ? 0 : 1 })
      message.success(user.is_active ? '帳號已停用' : '帳號已啟用')
      fetchUsers()
    } catch { message.error('操作失敗') }
  }

  const columns = [
    { title: '帳號', dataIndex: 'username' },
    { title: '姓名', dataIndex: 'name' },
    { title: '角色', dataIndex: 'role', render: (r: string) => <Tag color={ROLE_COLORS[r]}>{ROLE_LABELS[r]}</Tag> },
    { title: '電子郵件', dataIndex: 'email' },
    { title: '電話', dataIndex: 'phone' },
    {
      title: '狀態', dataIndex: 'is_active', width: 80,
      render: (active: number, r: any) => (
        <Switch checked={!!active} checkedChildren="啟用" unCheckedChildren="停用" onChange={() => handleToggleActive(r)} size="small" />
      ),
    },
    { title: '建立日期', dataIndex: 'created_at', width: 100, render: (d: string) => dayjs(d).format('YYYY-MM-DD') },
    {
      title: '操作', width: 120,
      render: (_: any, r: any) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => { setEditingUser(r); form.setFieldsValue(r); setModalOpen(true) }} />
          <Button size="small" icon={<KeyOutlined />} onClick={() => { setEditingUser(r); setPwdModalOpen(true) }} />
        </Space>
      ),
    },
  ]

  return (
    <PageScaffold
      eyebrow="Access Control"
      title="帳號維護"
      titleLevel={4}
      variant="compact"
      description="管理系統帳號、角色權限與密碼重設，支援最小權限治理。"
      actions={<Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingUser(null); form.resetFields(); setModalOpen(true) }}>新增帳號</Button>}
    >
      <Card>
        <Table columns={columns} dataSource={data} rowKey="id" loading={loading} size="small" pagination={false} />
      </Card>

      <Modal title={editingUser ? '編輯帳號' : '新增帳號'} open={modalOpen}
        onCancel={() => setModalOpen(false)} onOk={() => form.submit()} okText="儲存" cancelText="取消" destroyOnClose>
        <Form form={form} layout="vertical" onFinish={handleSave}>
          {!editingUser && (
            <Form.Item name="username" label="帳號" rules={[{ required: true }]}><Input /></Form.Item>
          )}
          <Form.Item name="name" label="姓名" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="role" label="角色" rules={[{ required: true }]}>
            <Select>
              {Object.entries(ROLE_LABELS).map(([v, l]) => <Option key={v} value={v}>{l}</Option>)}
            </Select>
          </Form.Item>
          {!editingUser && (
            <Form.Item name="password" label="密碼" rules={[{ required: true, min: 8, message: '至少 8 個字元' }]}>
              <Input.Password />
            </Form.Item>
          )}
          <Form.Item name="email" label="電子郵件"><Input /></Form.Item>
          <Form.Item name="phone" label="電話"><Input /></Form.Item>
        </Form>
      </Modal>

      <Modal title="重設密碼" open={pwdModalOpen}
        onCancel={() => setPwdModalOpen(false)} onOk={() => pwdForm.submit()} okText="確認重設" cancelText="取消" destroyOnClose>
        <Form form={pwdForm} layout="vertical" onFinish={handleResetPassword}>
          <Form.Item name="password" label="新密碼" rules={[{ required: true, min: 8, message: '至少 8 個字元' }]}>
            <Input.Password placeholder="至少 8 個字元" />
          </Form.Item>
        </Form>
      </Modal>
    </PageScaffold>
  )
}
