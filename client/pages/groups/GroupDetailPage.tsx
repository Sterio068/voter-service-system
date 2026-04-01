import React, { useState, useEffect } from 'react'
import { Card, Tabs, Descriptions, Button, Space, Typography, Table, Empty, Spin, Breadcrumb, message, Modal, Select, Input, Row, Col } from 'antd'
import { ArrowLeftOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../../utils/api'

const { Title } = Typography
const { Option } = Select

export default function GroupDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [group, setGroup] = useState<any>(null)
  const [addMemberOpen, setAddMemberOpen] = useState(false)
  const [selectedVoters, setSelectedVoters] = useState<number[]>([])
  const [voterOptions, setVoterOptions] = useState<any[]>([])
  const [voterSearch, setVoterSearch] = useState('')

  useEffect(() => { if (id) loadData() }, [id])

  const loadData = async () => {
    setLoading(true)
    try {
      const res = await api.get(`/groups/${id}`)
      setGroup(res.data.data)
    } catch { message.error('載入失敗') }
    finally { setLoading(false) }
  }

  const searchVoters = async (q: string) => {
    if (!q) return
    try {
      const res = await api.get(`/voters/search?q=${q}`)
      setVoterOptions(res.data.data || [])
    } catch {}
  }

  const handleAddMembers = async () => {
    if (!selectedVoters.length) return message.warning('請選擇成員')
    try {
      await api.post(`/groups/${id}/members`, { voter_ids: selectedVoters })
      message.success('成員已新增')
      setAddMemberOpen(false)
      setSelectedVoters([])
      loadData()
    } catch (err: any) { message.error(err.response?.data?.error || '新增失敗') }
  }

  const handleRemoveMember = async (voterId: number) => {
    try {
      await api.delete(`/groups/${id}/members/${voterId}`)
      message.success('成員已移除')
      loadData()
    } catch { message.error('移除失敗') }
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 100 }}><Spin size="large" /></div>
  if (!group) return <Empty description="團體不存在" />

  const memberColumns = [
    { title: '姓名', dataIndex: 'voter_name', render: (n: string, r: any) => <Button type="link" onClick={() => navigate(`/voters/${r.voter_id}`)}>{n}</Button> },
    { title: '手機', dataIndex: 'voter_mobile' },
    { title: '角色', dataIndex: 'role' },
    {
      title: '操作', width: 80,
      render: (_: any, r: any) => (
        <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleRemoveMember(r.voter_id)} />
      ),
    },
  ]

  return (
    <div>
      <Breadcrumb items={[{ title: '團體資料', href: '/groups' }, { title: group.name }]} style={{ marginBottom: 16 }} />
      <div className="page-header">
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>返回</Button>
          <Title level={4} style={{ margin: 0 }}>{group.name}</Title>
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddMemberOpen(true)}>新增成員</Button>
      </div>
      <Card>
        <Tabs defaultActiveKey="info" items={[
          {
            key: 'info', label: '基本資料',
            children: (
              <Descriptions bordered column={2} size="small">
                <Descriptions.Item label="團體名稱">{group.name}</Descriptions.Item>
                <Descriptions.Item label="類別">{group.category || '-'}</Descriptions.Item>
                <Descriptions.Item label="聯絡電話">{group.phone || '-'}</Descriptions.Item>
                <Descriptions.Item label="預估成員數">{group.member_count || '-'}</Descriptions.Item>
                <Descriptions.Item label="地址" span={2}>{group.address || '-'}</Descriptions.Item>
                <Descriptions.Item label="備註" span={2}>{group.note || '-'}</Descriptions.Item>
              </Descriptions>
            ),
          },
          {
            key: 'members', label: `成員名單 (${(group.members || []).length})`,
            children: (
              <Table columns={memberColumns} dataSource={group.members || []} rowKey="id" size="small" pagination={{ pageSize: 15 }} />
            ),
          },
        ]} />
      </Card>

      <Modal title="新增成員" open={addMemberOpen} onCancel={() => setAddMemberOpen(false)}
        onOk={handleAddMembers} okText="加入" cancelText="取消">
        <Select
          mode="multiple"
          style={{ width: '100%' }}
          placeholder="搜尋選民姓名或手機"
          showSearch
          filterOption={false}
          onSearch={searchVoters}
          onChange={setSelectedVoters}
        >
          {voterOptions.map((v: any) => (
            <Option key={v.id} value={v.id}>{v.name} {v.mobile ? `(${v.mobile})` : ''}</Option>
          ))}
        </Select>
      </Modal>
    </div>
  )
}
