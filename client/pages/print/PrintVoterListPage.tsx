import React, { useState, useRef } from 'react'
import {
  Card, Button, Space, Typography, Select, Input, Form, Divider,
  Row, Col, Checkbox, message, Table, Tag, Spin
} from 'antd'
import { PrinterOutlined, SearchOutlined } from '@ant-design/icons'
import api from '../../utils/api'
import PageScaffold from '../../components/ui/PageScaffold'
import WorkspaceToolbar from '../../components/ui/WorkspaceToolbar'
import dayjs from 'dayjs'

const { Text } = Typography
const { Option } = Select

const ALL_COLUMNS = [
  { key: 'name', label: '姓名', alwaysOn: true },
  { key: 'gender', label: '性別' },
  { key: 'birth_date', label: '出生日期' },
  { key: 'mobile', label: '手機' },
  { key: 'phone', label: '市話' },
  { key: 'household_full', label: '戶籍地址' },
  { key: 'election_area', label: '選區' },
  { key: 'occupation', label: '職業' },
  { key: 'company', label: '服務單位' },
  { key: 'tags', label: '標籤' },
  { key: 'note', label: '備註' },
]

const TAG_COLORS: Record<string, string> = {
  '樁腳': 'red', '志工': 'blue', '捐款者': 'gold', '支持者': 'green', '意見領袖': 'purple',
}

export default function PrintVoterListPage() {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [voters, setVoters] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [selectedCols, setSelectedCols] = useState<string[]>(
    ['name', 'mobile', 'household_full', 'tags']
  )
  const [officeName, setOfficeName] = useState('選民服務系統')
  const printRef = useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    api.get('/admin/settings').then(r => {
      if (r.data.data?.office_name) setOfficeName(r.data.data.office_name)
    }).catch(() => {})
  }, [])

  const handleSearch = async (values: any) => {
    setLoading(true)
    try {
      const params: any = { pageSize: 500 }
      if (values.search) params.search = values.search
      if (values.city) params.city = values.city
      if (values.district) params.district = values.district
      if (values.tag) params.tag = values.tag
      const res = await api.get('/voters', { params })
      setVoters(res.data.data || [])
      setTotal(res.data.total || 0)
    } catch { message.error('載入失敗') }
    finally { setLoading(false) }
  }

  const handlePrint = () => {
    if (!voters.length) return message.warning('請先搜尋選民資料')
    const w = window.open('', '_blank')
    if (!w) return message.error('無法開啟列印視窗')
    const printDate = dayjs().format('YYYY年MM月DD日')
    const cols = ALL_COLUMNS.filter(c => selectedCols.includes(c.key) || c.alwaysOn)
    const headerRow = cols.map(c => `<th>${c.label}</th>`).join('')
    const bodyRows = voters.map((v, i) => {
      const cells = cols.map(c => {
        let val = ''
        if (c.key === 'household_full') {
          val = [v.household_city, v.household_district, v.household_village, v.household_address].filter(Boolean).join('')
        } else if (c.key === 'tags') {
          val = (v.tags || []).join('、')
        } else {
          val = v[c.key] || ''
        }
        return `<td>${val}</td>`
      }).join('')
      return `<tr class="${i % 2 === 0 ? 'even' : 'odd'}"><td>${i + 1}</td>${cells}</tr>`
    }).join('')

    w.document.write(`<!DOCTYPE html><html lang="zh-TW"><head>
<meta charset="UTF-8"><title>${officeName} 選民名冊</title>
<style>
  body { font-family: '微軟正黑體','Noto Sans TC',sans-serif; font-size: 10pt; margin: 10mm; }
  h2 { text-align:center; margin-bottom:4px; }
  .meta { text-align:center; color:#666; font-size:9pt; margin-bottom:8px; }
  table { width:100%; border-collapse:collapse; }
  th { background:#1677ff; color:#fff; padding:4px 6px; text-align:left; font-size:9pt; }
  td { padding:3px 6px; border-bottom:1px solid #ddd; font-size:9pt; }
  tr.odd { background:#f5f5f5; }
  @media print { @page { size: A4 landscape; margin: 10mm; } }
</style></head><body>
<h2>📋 ${officeName} 選民名冊</h2>
<p class="meta">列印日期：${printDate}　共 ${total} 筆資料</p>
<table><thead><tr><th>#</th>${headerRow}</tr></thead><tbody>${bodyRows}</tbody></table>
</body></html>`)
    w.document.close()
    w.onload = () => { w.focus(); w.print() }
    setTimeout(() => { if (!w.closed) { w.focus(); w.print() } }, 500)
  }

  const tableColumns = [
    { title: '#', render: (_: any, __: any, i: number) => i + 1, width: 45 },
    { title: '姓名', dataIndex: 'name', width: 90 },
    { title: '手機', dataIndex: 'mobile', width: 115 },
    {
      title: '戶籍地址',
      render: (_: any, r: any) =>
        [r.household_city, r.household_district, r.household_village, r.household_address].filter(Boolean).join(''),
    },
    {
      title: '標籤',
      dataIndex: 'tags',
      width: 120,
      render: (tags?: string[]) => (tags || []).map(t => <Tag key={t} color={TAG_COLORS[t] || 'blue'} style={{ fontSize: 10 }}>{t}</Tag>),
    },
  ]

  return (
    <PageScaffold
      eyebrow="Print Studio"
      title="選民名冊列印"
      titleLevel={4}
      variant="compact"
      description="選擇欄位與篩選條件後產生 A4 橫式選民名冊。"
      actions={
        <Button type="primary" icon={<PrinterOutlined />} onClick={handlePrint} disabled={!voters.length}>
          列印名冊
        </Button>
      }
    >

      <WorkspaceToolbar
        title="名冊輸出條件"
        description="先查詢要列印的選民，再選擇名冊欄位。"
        meta={<Text type="secondary">最多顯示 500 筆</Text>}
      >
        <Form form={form} layout="inline" onFinish={handleSearch}>
          <Form.Item name="search">
            <Input placeholder="姓名/手機/地址" prefix={<SearchOutlined />} style={{ width: 200 }} />
          </Form.Item>
          <Form.Item name="city">
            <Select placeholder="縣市" allowClear style={{ width: 120 }}>
              {['台北市','新北市','桃園市','台中市','台南市','高雄市','基隆市','新竹市','嘉義市',
                '新竹縣','苗栗縣','彰化縣','南投縣','雲林縣','嘉義縣','屏東縣','宜蘭縣','花蓮縣','台東縣',
                '澎湖縣','金門縣','連江縣'].map(c => <Option key={c} value={c}>{c}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="tag">
            <Select placeholder="標籤" allowClear style={{ width: 110 }}>
              {['樁腳','志工','捐款者','支持者','意見領袖'].map(t => <Option key={t} value={t}>{t}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading}>查詢</Button>
          </Form.Item>
        </Form>

        <Divider style={{ margin: '12px 0 8px' }} />
        <Text type="secondary" style={{ fontSize: 12 }}>列印欄位：</Text>
        <Checkbox.Group
          value={selectedCols}
          onChange={vals => setSelectedCols(vals as string[])}
          style={{ marginLeft: 8 }}
        >
          {ALL_COLUMNS.filter(c => !c.alwaysOn).map(c => (
            <Checkbox key={c.key} value={c.key} style={{ fontSize: 12 }}>{c.label}</Checkbox>
          ))}
        </Checkbox.Group>
      </WorkspaceToolbar>

      <Card>
        <Text type="secondary" style={{ marginBottom: 8, display: 'block' }}>
          共 {total} 筆（最多顯示 500 筆）
        </Text>
        <Table
          columns={tableColumns}
          dataSource={voters}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={false}
          scroll={{ y: 400 }}
        />
      </Card>
    </PageScaffold>
  )
}
