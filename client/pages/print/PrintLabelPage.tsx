import React, { useState } from 'react'
import {
  Card, Button, Space, Typography, Select, Input, Form, Row, Col,
  InputNumber, message, Divider, Radio
} from 'antd'
import { PrinterOutlined, SearchOutlined } from '@ant-design/icons'
import api from '../../utils/api'
import PageScaffold from '../../components/ui/PageScaffold'
import WorkspaceToolbar from '../../components/ui/WorkspaceToolbar'
import dayjs from 'dayjs'

const { Text } = Typography
const { Option } = Select

// 常見標籤規格 (紙張 A4，每排列印張數)
const LABEL_PRESETS = [
  { label: '3×8 地址標籤 (24格)', cols: 3, rows: 8, width: 66, height: 33 },
  { label: '3×10 地址標籤 (30格)', cols: 3, rows: 10, width: 66, height: 26 },
  { label: '2×7 名條 (14格)', cols: 2, rows: 7, width: 96, height: 38 },
  { label: '2×10 寬版 (20格)', cols: 2, rows: 10, width: 96, height: 26 },
]

export default function PrintLabelPage() {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [voters, setVoters] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [preset, setPreset] = useState(0)
  const [addressType, setAddressType] = useState<'household' | 'mailing'>('household')
  const [officeName, setOfficeName] = useState('選民服務系統')

  React.useEffect(() => {
    api.get('/admin/settings').then(r => {
      if (r.data.data?.office_name) setOfficeName(r.data.data.office_name)
    }).catch(() => {})
  }, [])

  const handleSearch = async (values: any) => {
    setLoading(true)
    try {
      const params: any = { pageSize: 1000 }
      if (values.search) params.search = values.search
      if (values.city) params.city = values.city
      if (values.tag) params.tag = values.tag
      const res = await api.get('/voters', { params })
      setVoters(res.data.data || [])
      setTotal(res.data.total || 0)
    } catch { message.error('載入失敗') }
    finally { setLoading(false) }
  }

  const getAddress = (v: any) => {
    if (addressType === 'mailing' && v.mailing_address) return v.mailing_address
    return [v.household_city, v.household_district, v.household_village, v.household_address].filter(Boolean).join('')
  }

  const handlePrint = () => {
    if (!voters.length) return message.warning('請先搜尋選民資料')
    const cfg = LABEL_PRESETS[preset]
    const w = window.open('', '_blank')
    if (!w) return message.error('無法開啟列印視窗')

    const labels = voters.map(v => {
      const addr = getAddress(v)
      return `<div class="label">
        <div class="name">${v.name}</div>
        <div class="addr">${addr || '（無地址）'}</div>
        ${v.mobile ? `<div class="mobile">${v.mobile}</div>` : ''}
      </div>`
    }).join('')

    w.document.write(`<!DOCTYPE html><html lang="zh-TW"><head>
<meta charset="UTF-8"><title>${officeName} 地址標籤</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: '微軟正黑體','Noto Sans TC',sans-serif; }
  .grid { display: grid; grid-template-columns: repeat(${cfg.cols}, 1fr); }
  .label {
    width: ${cfg.width}mm; height: ${cfg.height}mm;
    padding: 3px 6px; border: 1px dashed #ccc;
    display: flex; flex-direction: column; justify-content: center;
    overflow: hidden;
  }
  .name { font-size: 11pt; font-weight: bold; }
  .addr { font-size: 9pt; margin-top: 2px; line-height: 1.3; }
  .mobile { font-size: 8pt; color: #666; margin-top: 2px; }
  @media print {
    @page { size: A4 portrait; margin: 8mm 5mm; }
    .label { border-color: transparent; }
  }
</style></head><body>
<div class="grid">${labels}</div>
</body></html>`)
    w.document.close()
    w.onload = () => { w.focus(); w.print() }
    setTimeout(() => { if (!w.closed) { w.focus(); w.print() } }, 500)
  }

  const cfg = LABEL_PRESETS[preset]
  const previewCount = Math.min(voters.length, cfg.cols * 2)

  return (
    <PageScaffold
      eyebrow="Label Studio"
      title="地址標籤列印"
      titleLevel={4}
      variant="compact"
      description="依標籤規格、地址類型與篩選條件產生 A4 地址標籤。"
      actions={
        <Button type="primary" icon={<PrinterOutlined />} onClick={handlePrint} disabled={!voters.length}>
          列印標籤
        </Button>
      }
    >

      <WorkspaceToolbar
        title="標籤輸出條件"
        description="設定名單篩選、標籤規格與地址來源後再列印。"
        meta={<Text type="secondary">{cfg.cols} 欄 × {cfg.rows} 列，共 {cfg.cols * cfg.rows} 格/頁</Text>}
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
        <Row gutter={[16, 8]} align="middle">
          <Col>
            <Text type="secondary" style={{ fontSize: 12 }}>標籤規格：</Text>
            <Select value={preset} onChange={setPreset} style={{ width: 230, marginLeft: 8 }}>
              {LABEL_PRESETS.map((p, i) => <Option key={i} value={i}>{p.label}</Option>)}
            </Select>
          </Col>
          <Col>
            <Text type="secondary" style={{ fontSize: 12 }}>地址類型：</Text>
            <Radio.Group
              value={addressType}
              onChange={e => setAddressType(e.target.value)}
              style={{ marginLeft: 8 }}
              size="small"
            >
              <Radio value="household">戶籍地址</Radio>
              <Radio value="mailing">通訊地址（優先）</Radio>
            </Radio.Group>
          </Col>
          <Col>
            <Text type="secondary" style={{ fontSize: 12 }}>
              規格：{cfg.cols}欄 × {cfg.rows}列 = {cfg.cols * cfg.rows} 格/頁 |
              每格 {cfg.width}×{cfg.height} mm
            </Text>
          </Col>
        </Row>
      </WorkspaceToolbar>

      <Card>
        <Text type="secondary">共 {total} 筆（最多列印 1000 筆）</Text>
        {voters.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <Text style={{ fontSize: 12 }}>預覽（前 {previewCount} 筆）：</Text>
            <div style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${cfg.cols}, 1fr)`,
              gap: 4,
              marginTop: 8,
              border: '1px solid #d9d9d9',
              padding: 8,
              maxWidth: 600,
            }}>
              {voters.slice(0, previewCount).map((v, i) => (
                <div key={i} style={{
                  border: '1px dashed #d9d9d9',
                  padding: '4px 8px',
                  minHeight: 50,
                  fontSize: 12,
                }}>
                  <div style={{ fontWeight: 600 }}>{v.name}</div>
                  <div style={{ color: '#666', fontSize: 11 }}>{getAddress(v) || '（無地址）'}</div>
                  {v.mobile && <div style={{ color: '#999', fontSize: 10 }}>{v.mobile}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </PageScaffold>
  )
}
