import React, { useState, useEffect } from 'react'
import { Table, Select, Space, Typography, Spin } from 'antd'
import api from '../../../utils/api'

const { Text } = Typography

export default function TypeAreaCross({ year }: { year: string }) {
  const [data, setData] = useState<any[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [districts, setDistricts] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<string>('')

  const load = (cat?: string) => {
    setLoading(true)
    const url = `/reports/type-area-cross?year=${year}${cat ? '&category='+encodeURIComponent(cat) : ''}`
    api.get(url).then(r => {
      setData(r.data.data || [])
      setCategories(r.data.categories || [])
      setDistricts(r.data.districts || [])
    }).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { load(selectedCategory) }, [year, selectedCategory])

  if (loading) return <Spin />

  // Build matrix: district → { category: count }
  const matrix: Record<string, Record<string, number>> = {}
  districts.forEach(d => { matrix[d] = {} })
  data.forEach(r => { if (!matrix[r.district]) matrix[r.district] = {}; matrix[r.district][r.category] = r.count })
  const topCategories = categories.slice(0, 8)
  const maxCount = Math.max(...data.map(d => d.count), 1)

  return (
    <div>
      <Space style={{ marginBottom: 12 }}>
        <Text>類別篩選：</Text>
        <Select value={selectedCategory || undefined} allowClear placeholder="全部類別"
          onChange={v => setSelectedCategory(v || '')} style={{ width: 150 }}>
          {categories.map(c => <Select.Option key={c} value={c}>{c}</Select.Option>)}
        </Select>
      </Space>
      <Table
        dataSource={districts.map(d => ({ district: d, ...matrix[d] }))}
        rowKey="district"
        size="small"
        scroll={{ x: 800 }}
        pagination={false}
        columns={[
          { title: '鄉鎮區', dataIndex: 'district', fixed: 'left' as const, width: 90 },
          ...topCategories.map(cat => ({
            title: cat,
            dataIndex: cat,
            width: 80,
            render: (v: number) => v ? (
              <div style={{ textAlign: 'center', background: `rgba(22,119,255,${v/maxCount*0.8})`, borderRadius: 3, padding: '2px 0', color: v/maxCount > 0.5 ? 'white' : 'inherit' }}>
                {v}
              </div>
            ) : ''
          })),
        ]}
      />
    </div>
  )
}
