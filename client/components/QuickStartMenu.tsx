import React, { useState } from 'react'
import { Modal, Card, Row, Col, Typography } from 'antd'
import { PhoneOutlined, SearchOutlined, CheckSquareOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'

const { Title, Text } = Typography

export default function QuickStartMenu() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  const options = [
    {
      icon: <PhoneOutlined style={{ fontSize: 32, color: '#1677ff' }} />,
      title: '接到陳情',
      desc: '選民來電或現場陳情，快速立案',
      action: () => { navigate('/petitions'); setOpen(false) },
      color: '#e6f4ff',
    },
    {
      icon: <SearchOutlined style={{ fontSize: 32, color: '#52c41a' }} />,
      title: '查詢選民',
      desc: '查資料、補聯絡記錄、查案件進度',
      action: () => { navigate('/voters'); setOpen(false) },
      color: '#f6ffed',
    },
    {
      icon: <CheckSquareOutlined style={{ fontSize: 32, color: '#fa8c16' }} />,
      title: '處理今天工作',
      desc: '查看今日待辦、行程、追蹤事項',
      action: () => { navigate('/tasks'); setOpen(false) },
      color: '#fff7e6',
    },
  ]

  return (
    <>
      <div
        style={{ cursor: 'pointer', padding: '4px 8px', borderRadius: 4, fontSize: 12, color: '#666' }}
        onClick={() => setOpen(true)}
        title="快速開始"
      >
        🚀 快速開始
      </div>
      <Modal title="今天要做什麼？" open={open} onCancel={() => setOpen(false)} footer={null} width={520}>
        <Row gutter={[12, 12]} style={{ marginTop: 8 }}>
          {options.map(opt => (
            <Col span={8} key={opt.title}>
              <Card
                hoverable
                style={{ textAlign: 'center', background: opt.color, cursor: 'pointer' }}
                onClick={opt.action}
              >
                {opt.icon}
                <Title level={5} style={{ margin: '8px 0 4px' }}>{opt.title}</Title>
                <Text type="secondary" style={{ fontSize: 11 }}>{opt.desc}</Text>
              </Card>
            </Col>
          ))}
        </Row>
      </Modal>
    </>
  )
}
