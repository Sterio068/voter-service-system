import React, { useState, useEffect } from 'react'
import { Table, Empty, Button, Modal, Form, Select, Input, Space, Tag, message, Popconfirm } from 'antd'
import { PlusOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons'
import api from '../../../utils/api'

const { Option } = Select

const RELATION_TYPES = [
  '配偶', '父母', '子女', '兄弟姊妹', '祖父母', '孫子女',
  '親戚', '鄰居', '同事', '朋友', '樁腳', '里長', '其他',
]
const RELATION_COLORS: Record<string, string> = {
  配偶: 'red', 父母: 'orange', 子女: 'orange', 兄弟姊妹: 'gold',
  祖父母: 'lime', 孫子女: 'lime', 親戚: 'green', 鄰居: 'cyan',
  同事: 'blue', 朋友: 'geekblue', 樁腳: 'purple', 里長: 'magenta', 其他: 'default',
}

interface Props {
  voterId: number
  voterData?: any
}

export default function RelationsTab({ voterId }: Props) {
  const [relations, setRelations] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()
  const [voterOptions, setVoterOptions] = useState<any[]>([])
  const [searching, setSearching] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.get(`/voters/${voterId}/relations`)
      setRelations(res.data.data || [])
    } catch { message.error('載入失敗') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [voterId])

  const handleSearch = async (val: string) => {
    if (!val || val.length < 1) return
    setSearching(true)
    try {
      const res = await api.get(`/voters/search?q=${encodeURIComponent(val)}&limit=20`)
      setVoterOptions((res.data.data || []).filter((v: any) => v.id !== voterId))
    } catch {}
    finally { setSearching(false) }
  }

  const handleSave = async (values: any) => {
    setSaving(true)
    try {
      await api.post(`/voters/${voterId}/relations`, values)
      message.success('關聯已新增')
      setModalOpen(false)
      form.resetFields()
      setVoterOptions([])
      load()
    } catch (err: any) { message.error(err.response?.data?.error || '新增失敗') }
    finally { setSaving(false) }
  }

  const handleDelete = async (rid: number, name: string) => {
    try {
      await api.delete(`/voters/${voterId}/relations/${rid}`)
      message.success(`已移除與「${name}」的關聯`)
      load()
    } catch (err: any) { message.error(err.response?.data?.error || '刪除失敗') }
  }

  const columns = [
    {
      title: '關係類型',
      dataIndex: 'relation_type',
      width: 100,
      render: (t: string) => <Tag color={RELATION_COLORS[t] || 'default'}>{t}</Tag>,
    },
    {
      title: '關聯選民',
      dataIndex: 'related_name',
      render: (name: string, r: any) => (
        <Space direction="vertical" size={0}>
          <span>{name || '（已刪除）'}</span>
          {r.related_mobile && <span style={{ fontSize: 12, color: '#888' }}>{r.related_mobile}</span>}
          {r.related_address && <span style={{ fontSize: 11, color: '#aaa' }}>{r.related_address}</span>}
        </Space>
      ),
    },
    { title: '備註', dataIndex: 'note', ellipsis: true },
    {
      title: '操作',
      width: 80,
      render: (_: any, r: any) => (
        <Popconfirm
          title={`確定移除與「${r.related_name}」的關聯？`}
          onConfirm={() => handleDelete(r.id, r.related_name)}
        >
          <Button size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} size="small" onClick={() => { form.resetFields(); setVoterOptions([]); setModalOpen(true) }}>
          新增關聯
        </Button>
      </div>

      {relations.length === 0 && !loading
        ? <Empty description="尚無選民關聯記錄" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        : <Table
            columns={columns}
            dataSource={relations}
            rowKey="id"
            loading={loading}
            size="small"
            pagination={false}
          />
      }

      <Modal
        title="新增選民關聯"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText="新增"
        confirmLoading={saving}
        destroyOnClose
        width={420}
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="related_voter_id" label="關聯選民" rules={[{ required: true, message: '請選擇選民' }]}>
            <Select
              showSearch
              filterOption={false}
              onSearch={handleSearch}
              loading={searching}
              placeholder="輸入姓名或電話搜尋"
              suffixIcon={<SearchOutlined />}
              notFoundContent={searching ? '搜尋中...' : '請輸入關鍵字'}
            >
              {voterOptions.map((v: any) => (
                <Option key={v.id} value={v.id}>{v.name}{v.mobile ? ` (${v.mobile})` : ''}</Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="relation_type" label="關係類型" rules={[{ required: true, message: '請選擇關係' }]}>
            <Select placeholder="選擇關係類型">
              {RELATION_TYPES.map(t => (
                <Option key={t} value={t}><Tag color={RELATION_COLORS[t] || 'default'}>{t}</Tag></Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="note" label="備註">
            <Input placeholder="選填" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
