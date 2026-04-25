import React from 'react'
import { Alert, Card, Col, Row, Table, Tag, Typography } from 'antd'
import { KeyOutlined, SafetyCertificateOutlined } from '@ant-design/icons'
import { buildHelpRoleData } from '../../../utils/helpAccess'

const { Title, Paragraph, Text } = Typography

const SHORTCUTS = [
  { key: 'Ctrl + N', desc: '新增陳情案件' },
  { key: 'Ctrl + V', desc: '新增選民資料' },
  { key: 'Ctrl + T', desc: '新增待辦事項' },
  { key: 'Ctrl + Shift + D', desc: '今日待辦事項' },
  { key: 'Ctrl + B', desc: '今日行程' },
  { key: 'Ctrl + K', desc: '全站搜尋' },
  { key: '?', desc: '顯示快捷鍵說明' },
]

const ROLE_DATA = buildHelpRoleData()
const ROLE_COLUMNS = [
  { title: '模組', dataIndex: 'module', key: 'module', width: 120 },
  { title: <Tag color="red">管理員</Tag>, dataIndex: 'admin', key: 'admin', align: 'center' as const },
  { title: <Tag color="orange">主管</Tag>, dataIndex: 'supervisor', key: 'supervisor', align: 'center' as const },
  { title: <Tag color="blue">助理</Tag>, dataIndex: 'assistant', key: 'assistant', align: 'center' as const },
  { title: <Tag>志工</Tag>, dataIndex: 'volunteer', key: 'volunteer', align: 'center' as const },
]

export default function RoleQuickRef() {
  return (
    <section id="help-quickref" style={{ marginBottom: 32, scrollMarginTop: 24 }}>
      <Title level={3} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <SafetyCertificateOutlined style={{ color: '#007AFF' }} />
        快速參考
      </Title>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card
            title={
              <span>
                <SafetyCertificateOutlined style={{ marginRight: 8, color: '#007AFF' }} />
                角色權限總表
              </span>
            }
            size="small"
            style={{ borderRadius: 12, height: '100%' }}
          >
            <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>
              依目前 route guard 與模組權限自動整理；角色設定異動會即時反映。
            </Paragraph>
            <Table
              dataSource={ROLE_DATA}
              columns={ROLE_COLUMNS}
              pagination={false}
              size="small"
              bordered
              rowKey="module"
              scroll={{ x: 'max-content' }}
            />
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          <Card
            title={
              <span>
                <KeyOutlined style={{ marginRight: 8, color: '#FF9500' }} />
                鍵盤快捷鍵
              </span>
            }
            size="small"
            style={{ borderRadius: 12, height: '100%' }}
          >
            <Table
              dataSource={SHORTCUTS}
              columns={[
                {
                  title: '按鍵',
                  dataIndex: 'key',
                  width: 150,
                  render: (k: string) => (
                    <kbd
                      style={{
                        background: '#f5f5f7',
                        border: '1px solid #d1d1d6',
                        borderRadius: 5,
                        padding: '1px 8px',
                        fontFamily: 'monospace',
                        fontSize: 12,
                      }}
                    >
                      {k}
                    </kbd>
                  ),
                },
                { title: '功能', dataIndex: 'desc' },
              ]}
              pagination={false}
              size="small"
              rowKey="key"
              showHeader={false}
            />
            <Alert
              message={<>在任意頁面按 <Text keyboard>?</Text> 可隨時叫出快捷鍵清單。</>}
              type="info"
              showIcon
              style={{ marginTop: 12 }}
            />
          </Card>
        </Col>
      </Row>
    </section>
  )
}
