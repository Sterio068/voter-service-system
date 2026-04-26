import React, { useState, useEffect } from 'react'
import {
  Card, Tabs, Tag, Button, Space, Typography, Spin, Breadcrumb, message, Drawer, Form, Input, Select,
  DatePicker, Radio, Row, Col, Divider
} from 'antd'
import { ArrowLeftOutlined, EditOutlined, StarFilled, PhoneOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../../utils/api'
import PageScaffold from '../../components/ui/PageScaffold'
import EmptyState from '../../components/ui/EmptyState'
import FormFooter from '../../components/ui/FormFooter'
import dayjs from 'dayjs'
import BasicTab from './components/BasicTab'
import ContactTab from './components/ContactTab'
import PetitionTab from './components/PetitionTab'
import EngagementTab from './components/EngagementTab'
import TaskTab from './components/TaskTab'
import RelationsTab from './components/RelationsTab'

const { Text } = Typography
const { Option } = Select

const TAG_COLORS: Record<string, string> = {
  '樁腳': 'red', '志工': 'blue', '捐款者': 'gold', '支持者': 'green', '意見領袖': 'purple'
}

export default function VoterDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [voter, setVoter] = useState<any>(null)
  const [contacts, setContacts] = useState<any[]>([])
  const [engagement, setEngagement] = useState<any>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [form] = Form.useForm()
  const [tags, setTags] = useState<string[]>([])

  const mountedRef = React.useRef(true)
  useEffect(() => {
    mountedRef.current = true
    if (id) loadVoter(id)
    fetchTags()
    return () => { mountedRef.current = false }
  }, [id])

  const fetchTags = async () => {
    try {
      const res = await api.get('/admin/categories?type=voter_tag')
      if (mountedRef.current) setTags(res.data.data?.map((t: any) => t.name) || [])
    } catch {}
  }

  const loadVoter = async (voterId: string) => {
    setLoading(true)
    try {
      const [voterRes, contactsRes] = await Promise.all([
        api.get(`/voters/${voterId}`),
        api.get(`/voters/${voterId}/contacts`).catch(() => ({ data: { data: [] } })),
      ])
      if (!mountedRef.current) return
      setVoter(voterRes.data.data)
      setContacts(contactsRes.data.data || [])
    } catch {
      if (mountedRef.current) message.error('載入選民資料失敗')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
    api.get(`/voters/${voterId}/engagement`).then(r => { if (mountedRef.current) setEngagement(r.data.data) }).catch(() => {})
  }

  const handleEdit = () => {
    form.setFieldsValue({
      ...voter,
      birth_date: voter.birth_date ? dayjs(voter.birth_date) : null,
    })
    setDrawerOpen(true)
  }

  const handleSave = async (values: any) => {
    setSavingEdit(true)
    try {
      const payload = {
        ...values,
        birth_date: values.birth_date ? dayjs(values.birth_date).format('YYYY-MM-DD') : undefined,
        tags: values.tags || [],
      }
      await api.put(`/voters/${id}`, payload)
      message.success('選民資料已更新')
      setDrawerOpen(false)
      form.resetFields()
      if (id) loadVoter(id)
    } catch (err: any) {
      message.error(err.response?.data?.error || '儲存失敗')
    } finally {
      setSavingEdit(false)
    }
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 100 }}><Spin size="large" /></div>
  if (!voter) return <EmptyState title="選民不存在" description="這筆資料可能已被刪除或目前沒有讀取權限。" />

  const voterId = Number(id)

  const tabItems = [
    {
      key: 'basic',
      label: '基本資料',
      children: <BasicTab voterId={voterId} voterData={voter} />,
    },
    {
      key: 'contacts',
      label: `聯絡紀錄 (${contacts.length})`,
      children: <ContactTab voterId={voterId} voterData={voter} />,
    },
    {
      key: 'petitions',
      label: '陳情案件',
      children: <PetitionTab voterId={voterId} voterData={voter} />,
    },
    {
      key: 'engagement',
      label: '經營狀況',
      children: <EngagementTab voterId={voterId} voterData={voter} />,
    },
    {
      key: 'tasks',
      label: '待辦事項',
      children: <TaskTab voterId={voterId} voterData={voter} />,
    },
    {
      key: 'relations',
      label: '人際關聯',
      children: <RelationsTab voterId={voterId} voterData={voter} />,
    },
    {
      key: 'documents',
      label: '文件',
      children: <EmptyState title="尚無相關文件" description="未來公文、附件或列印紀錄可在此彙整。" />,
    },
  ]

  return (
    <PageScaffold
      eyebrow="Voter Profile"
      title={voter.name}
      titleLevel={4}
      variant="compact"
      description={voter.household_address || voter.mobile || '選民完整互動檢視'}
      actions={
        <>
          <Button icon={<ArrowLeftOutlined />} aria-label="返回上一頁" onClick={() => navigate(-1)}>返回</Button>
          {(voter.tags || []).map((tag: string) => (
            <Tag key={tag} color={TAG_COLORS[tag] || 'blue'}>{tag}</Tag>
          ))}
          <Button icon={<EditOutlined />} aria-label="編輯選民資料" type="primary" onClick={handleEdit}>編輯</Button>
        </>
      }
    >
      <Breadcrumb items={[{ title: '選民資料', href: '/voters' }, { title: voter.name }]} style={{ marginBottom: 16 }} />

      {/* U-10: Summary header bar */}
      <Card size="small" style={{ marginBottom: 12, background: '#fafafa' }}>
        <Row gutter={24} align="middle">
          <Col>
            <Space size={4}>
              <PhoneOutlined style={{ color: '#888' }} />
              <Text type="secondary" style={{ fontSize: 12 }}>最後聯絡日</Text>
              <Text strong style={{ fontSize: 13 }}>
                {contacts.length > 0 ? dayjs(contacts[0].contact_date).format('YYYY-MM-DD') : '—'}
              </Text>
            </Space>
          </Col>
          <Col>
            <Space size={4}>
              <Text type="secondary" style={{ fontSize: 12 }}>支持度</Text>
              <Space size={2}>
                {[1,2,3,4,5].map(n => (
                  <StarFilled key={n} style={{ fontSize: 14, color: n <= (engagement?.support_level || voter.support_level || 0) ? '#faad14' : '#e8e8e8' }} />
                ))}
              </Space>
            </Space>
          </Col>
          <Col>
            <Space size={4}>
              <ThunderboltOutlined style={{ color: '#888' }} />
              <Text type="secondary" style={{ fontSize: 12 }}>活躍分數</Text>
              <Text strong style={{ fontSize: 13 }}>{engagement?.score ?? '—'}</Text>
            </Space>
          </Col>
          <Col>
            <Space size={4} wrap>
              <Text type="secondary" style={{ fontSize: 12 }}>標籤</Text>
              {(voter.tags || []).length > 0
                ? (voter.tags || []).map((t: string) => <Tag key={t} color={TAG_COLORS[t] || 'blue'} style={{ fontSize: 11 }}>{t}</Tag>)
                : <Text type="secondary" style={{ fontSize: 12 }}>—</Text>
              }
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Edit voter drawer */}
      <Drawer
        title="編輯選民"
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); form.resetFields() }}
        width={600}
        destroyOnClose
        footer={
          <FormFooter
            onCancel={() => setDrawerOpen(false)}
            onSubmit={() => form.submit()}
            submitLoading={savingEdit}
          />
        }
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Divider orientation="left" orientationMargin={0}>基本資料</Divider>
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
              <Form.Item name="mobile" label="手機">
                <Input />
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
            <Col span={24}>
              <Form.Item name="email" label="電子郵件">
                <Input type="email" />
              </Form.Item>
            </Col>
          </Row>
          <Divider orientation="left" orientationMargin={0}>戶籍資料</Divider>
          <Row gutter={12}>
            <Col span={8}><Form.Item name="household_city" label="縣市"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="household_district" label="鄉鎮區"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="household_village" label="村里"><Input /></Form.Item></Col>
            <Col span={24}><Form.Item name="household_address" label="詳細地址"><Input /></Form.Item></Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="title" label="頭銜">
                <Input placeholder="如：里長、社區主委" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="tags" label="標籤">
                <Select mode="multiple" placeholder="選擇標籤">
                  {tags.map(t => <Option key={t} value={t}>{t}</Option>)}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="note" label="備註">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Drawer>

      <Card>
        <Tabs defaultActiveKey="basic" type="card" items={tabItems} />
      </Card>
    </PageScaffold>
  )
}
