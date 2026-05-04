import React from 'react'
import { Button, Col, Form, Row } from 'antd'
import { SettingOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'

export type ManagedCategoryTab =
  | 'schedule_type'
  | 'petition_category'
  | 'petition_area'
  | 'voter_tag'
  | 'group_category'
  | 'doc_category'
  | 'gift_category'

const TAB_LABELS: Record<ManagedCategoryTab, string> = {
  schedule_type: '行程類型',
  petition_category: '陳情類別',
  petition_area: '陳情區域',
  voter_tag: '選民標籤',
  group_category: '團體類別',
  doc_category: '公文分類',
  gift_category: '禮品類別',
}

type CategoryManageButtonProps = {
  tab: ManagedCategoryTab
  children?: React.ReactNode
  block?: boolean
  size?: 'small' | 'middle' | 'large'
}

export function CategoryManageButton({ tab, children, block, size }: CategoryManageButtonProps) {
  const navigate = useNavigate()
  return (
    <Button
      icon={<SettingOutlined />}
      block={block}
      size={size}
      onClick={() => navigate(`/admin/categories?tab=${tab}`)}
    >
      {children || `管理${TAB_LABELS[tab]}`}
    </Button>
  )
}

type ManagedCategoryFieldProps = {
  name: string
  label: React.ReactNode
  tab: ManagedCategoryTab
  children: React.ReactNode
  buttonText?: string
  rules?: any[]
}

export default function ManagedCategoryField({
  name,
  label,
  tab,
  children,
  buttonText,
  rules,
}: ManagedCategoryFieldProps) {
  return (
    <Row gutter={8} align="bottom">
      <Col xs={24} sm={16}>
        <Form.Item name={name} label={label} rules={rules}>
          {children}
        </Form.Item>
      </Col>
      <Col xs={24} sm={8}>
        <Form.Item label=" " colon={false}>
          <CategoryManageButton tab={tab} block>
            {buttonText || '管理'}
          </CategoryManageButton>
        </Form.Item>
      </Col>
    </Row>
  )
}
