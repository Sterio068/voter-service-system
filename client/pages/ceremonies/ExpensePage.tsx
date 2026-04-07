import React, { useState, useEffect } from 'react'
import {
  Card, Row, Col, Statistic, Select, DatePicker, Typography, Table, Tag,
  Progress, Space, Button, Modal, Form, Input, InputNumber, message, Popconfirm, Empty, Tabs
} from 'antd'
import { PlusOutlined, DeleteOutlined, TrophyOutlined, DollarOutlined } from '@ant-design/icons'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts'
import api from '../../utils/api'
import dayjs from 'dayjs'
import { CEREMONY_TYPE_LABELS } from '../../utils/constants'

const { Title, Text } = Typography
const { Option } = Select

const TYPE_COLORS_LIST = ['#1677ff','#52c41a','#fa8c16','#722ed1','#eb2f96','#13c2c2','#faad14','#f5222d','#a0d911']

export default function ExpensePage() {
  const [year, setYear] = useState(dayjs().year())
  const [month, setMonth] = useState<number | null>(null)
  const [summary, setSummary] = useState<any>({})
  const [loading, setLoading] = useState(false)
  const [budgets, setBudgets] = useState<any[]>([])
  const [availableYears, setAvailableYears] = useState<number[]>([])
  const [budgetModalOpen, setBudgetModalOpen] = useState(false)
  const [budgetForm] = Form.useForm()

  useEffect(() => {
    api.get('/expenses/years').then(r => {
      const years: number[] = r.data.data || []
      if (!years.includes(dayjs().year())) years.unshift(dayjs().year())
      setAvailableYears(years)
    }).catch(() => {})
  }, [])

  useEffect(() => { fetchSummary(); fetchBudgets() }, [year, month])

  const fetchSummary = async () => {
    setLoading(true)
    try {
      const res = await api.get('/expenses/summary', { params: { year, month: month || undefined } })
      setSummary(res.data.data || {})
    } catch {}
    finally { setLoading(false) }
  }

  const fetchBudgets = async () => {
    try {
      const res = await api.get('/expenses/budgets', { params: { year } })
      setBudgets(res.data.data || [])
    } catch {}
  }

  const totalAmount = summary.total?.total || 0
  const totalCount = summary.total?.count || 0
  const paidAmount = (summary.byPayStatus || []).find((s: any) => s.payment_status === 'paid')?.amount || 0
  const pendingAmount = (summary.byPayStatus || []).find((s: any) => s.payment_status === 'pending')?.amount || 0

  // 月度趨勢 data（補齊 1-12 月）
  const monthlyData = Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, '0')
    const found = (summary.monthly || []).find((r: any) => r.month === m)
    return { month: `${i + 1}月`, amount: found?.amount || 0, count: found?.count || 0 }
  })

  // 類型圓餅
  const typeData = (summary.byType || []).map((r: any) => ({
    name: CEREMONY_TYPE_LABELS[r.ceremony_type] || r.ceremony_type,
    value: r.amount,
    count: r.count,
  }))

  // 廠商排名
  const vendorData = summary.byVendor || []

  // 年度預算
  const yearBudget = budgets.find((b: any) => b.budget_type === 'total' && !b.month)
  const budgetUsed = yearBudget ? Math.round((totalAmount / yearBudget.amount) * 100) : null

  const vendorColumns = [
    { title: '排名', key: 'rank', width: 50, render: (_: any, __: any, i: number) => (
      i === 0 ? <TrophyOutlined style={{ color: '#faad14' }} /> :
      i === 1 ? <TrophyOutlined style={{ color: '#8c8c8c' }} /> :
      i === 2 ? <TrophyOutlined style={{ color: '#d46b08' }} /> : i + 1
    )},
    { title: '廠商', dataIndex: 'vendor_name', key: 'name' },
    { title: '類別', dataIndex: 'category', key: 'cat', width: 70, render: (v: string) => <Tag>{v}</Tag> },
    { title: '採購次數', dataIndex: 'order_count', key: 'count', width: 80, render: (v: number) => `${v} 次` },
    {
      title: '總金額', dataIndex: 'amount', key: 'amount', width: 120,
      render: (v: number) => <Text strong>NT$ {v.toLocaleString()}</Text>
    },
    {
      title: '占比', key: 'ratio', width: 100,
      render: (_: any, r: any) => (
        <Progress percent={totalAmount ? Math.round(r.amount / totalAmount * 100) : 0} size="small" />
      )
    },
  ]

  const budgetColumns = [
    { title: '類型', dataIndex: 'budget_type', width: 80, render: (v: string) => v === 'total' ? '年度總額' : v },
    { title: '月份', dataIndex: 'month', width: 60, render: (v: any) => v ? `${v}月` : '全年' },
    { title: '預算', dataIndex: 'amount', render: (v: number) => `NT$ ${v.toLocaleString()}` },
    { title: '備註', dataIndex: 'note', render: (v: string) => v || '—' },
    {
      title: '操作', width: 60,
      render: (_: any, r: any) => (
        <Popconfirm title="確定刪除？" onConfirm={async () => {
          try {
            await api.delete(`/expenses/budgets/${r.id}`)
            fetchBudgets()
            fetchSummary()
          } catch { message.error('刪除失敗') }
        }}>
          <Button size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      )
    }
  ]

  return (
    <div>
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>💰 收支統計</Title>
        <Space>
          <Select value={year} onChange={v => { setYear(v); setMonth(null) }} style={{ width: 90 }}>
            {availableYears.map(y => <Option key={y} value={y}>{y}年</Option>)}
          </Select>
          <Select placeholder="篩選月份" allowClear style={{ width: 90 }} value={month || undefined}
            onChange={v => setMonth(v || null)}>
            {Array.from({ length: 12 }, (_, i) => <Option key={i + 1} value={i + 1}>{i + 1}月</Option>)}
          </Select>
        </Space>
      </div>

      {/* 總覽卡 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card size="small">
            <Statistic title={month ? `${year}年${month}月支出` : `${year}年總支出`}
              value={totalAmount} prefix="NT$" formatter={v => Number(v).toLocaleString()} valueStyle={{ color: '#1677ff' }} />
            {yearBudget && budgetUsed !== null && (
              <Progress percent={Math.min(budgetUsed, 100)} size="small"
                status={budgetUsed > 90 ? 'exception' : budgetUsed > 70 ? 'active' : 'normal'}
                format={() => `${budgetUsed}% / 預算 NT$${yearBudget.amount.toLocaleString()}`} />
            )}
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="已付款" value={paidAmount} prefix="NT$" formatter={v => Number(v).toLocaleString()} valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="待付款" value={pendingAmount} prefix="NT$" formatter={v => Number(v).toLocaleString()} valueStyle={{ color: pendingAmount > 0 ? '#faad14' : undefined }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="記錄筆數" value={totalCount} suffix="筆" />
          </Card>
        </Col>
      </Row>

      <Tabs items={[
        {
          key: 'trend', label: '月度趨勢',
          children: (
            <Card size="small">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={monthlyData} margin={{ top: 8, right: 20, left: 10, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${Math.round(v / 1000)}K`} />
                  <Tooltip formatter={(v: number) => [`NT$ ${v.toLocaleString()}`, '支出']} />
                  <Bar dataKey="amount" name="支出" fill="#1677ff" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )
        },
        {
          key: 'type', label: '類型分析',
          children: (
            <Card size="small">
              {typeData.length === 0
                ? <Empty description="無資料" />
                : <Row gutter={16}>
                  <Col span={12}>
                    <ResponsiveContainer width="100%" height={260}>
                      <PieChart>
                        <Pie data={typeData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value"
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                          {typeData.map((_: any, i: number) => <Cell key={i} fill={TYPE_COLORS_LIST[i % TYPE_COLORS_LIST.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v: number) => `NT$ ${v.toLocaleString()}`} />
                      </PieChart>
                    </ResponsiveContainer>
                  </Col>
                  <Col span={12}>
                    <Table dataSource={typeData} rowKey="name" size="small" pagination={false}
                      columns={[
                        { title: '類型', dataIndex: 'name' },
                        { title: '筆數', dataIndex: 'count', width: 60 },
                        { title: '金額', dataIndex: 'value', render: (v: number) => <Text strong>NT$ {v.toLocaleString()}</Text> },
                      ]}
                      footer={() => <div style={{ textAlign: 'right' }}>合計：<Text strong>NT$ {totalAmount.toLocaleString()}</Text></div>}
                    />
                  </Col>
                </Row>
              }
            </Card>
          )
        },
        {
          key: 'vendor', label: '廠商排名',
          children: (
            <Card size="small">
              {vendorData.length === 0
                ? <Empty description="無廠商資料" />
                : <Table dataSource={vendorData} rowKey="id" size="small" pagination={false} columns={vendorColumns} />
              }
            </Card>
          )
        },
        {
          key: 'budget', label: '預算管理',
          children: (
            <Card size="small"
              extra={<Button size="small" icon={<PlusOutlined />} type="primary" onClick={() => { budgetForm.resetFields(); setBudgetModalOpen(true) }}>設定預算</Button>}>
              {budgets.length === 0
                ? <Empty description="尚未設定預算" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                : <Table dataSource={budgets} rowKey="id" size="small" pagination={false} columns={budgetColumns} />
              }
              {yearBudget && (
                <div style={{ marginTop: 16, padding: 12, background: '#f5f5f5', borderRadius: 6 }}>
                  <Text>年度預算：NT$ {yearBudget.amount.toLocaleString()}　</Text>
                  <Text>已使用：NT$ {totalAmount.toLocaleString()}　</Text>
                  <Text type={totalAmount > yearBudget.amount ? 'danger' : 'success'}>
                    剩餘：NT$ {(yearBudget.amount - totalAmount).toLocaleString()}
                  </Text>
                  <Progress
                    percent={Math.min(Math.round(totalAmount / yearBudget.amount * 100), 100)}
                    status={totalAmount > yearBudget.amount ? 'exception' : totalAmount / yearBudget.amount > 0.8 ? 'active' : 'normal'}
                    style={{ marginTop: 8 }}
                  />
                </div>
              )}
            </Card>
          )
        }
      ]} />

      {/* 預算設定 Modal */}
      <Modal title="設定預算" open={budgetModalOpen}
        onCancel={() => { setBudgetModalOpen(false); budgetForm.resetFields() }}
        onOk={() => budgetForm.submit()} okText="儲存">
        <Form form={budgetForm} layout="vertical" onFinish={async (values) => {
          try {
            await api.post('/expenses/budgets', { ...values, year })
            message.success('預算已儲存')
            setBudgetModalOpen(false)
            budgetForm.resetFields()
            fetchBudgets()
          } catch { message.error('儲存失敗') }
        }}>
          <Form.Item name="budget_type" label="預算類型" initialValue="total">
            <Select>
              <Option value="total">年度總預算</Option>
              <Option value="monthly">月度預算</Option>
            </Select>
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.budget_type !== cur.budget_type}>
            {({ getFieldValue }) => getFieldValue('budget_type') === 'monthly' && (
              <Form.Item name="month" label="月份" rules={[{ required: true }]}>
                <Select>{Array.from({ length: 12 }, (_, i) => <Option key={i + 1} value={i + 1}>{i + 1}月</Option>)}</Select>
              </Form.Item>
            )}
          </Form.Item>
          <Form.Item name="amount" label="預算金額（NT$）" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} formatter={v => `NT$ ${v}`} parser={(v: any) => Number(String(v).replace(/[^0-9]/g, '')) || 0} />
          </Form.Item>
          <Form.Item name="note" label="備註"><Input /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
