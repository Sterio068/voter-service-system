import React from 'react'
import { Button, Space, Typography } from 'antd'

const { Text } = Typography

interface SelectionActionBarProps {
  selectedCount: number
  itemLabel?: string
  onClear: () => void
  children: React.ReactNode
  fixed?: boolean
}

export default function SelectionActionBar({
  selectedCount,
  itemLabel = '筆',
  onClear,
  children,
  fixed = false,
}: SelectionActionBarProps) {
  if (selectedCount <= 0) return null

  return (
    <div className={`vss-selection-bar ${fixed ? 'vss-selection-bar-fixed' : ''}`}>
      <Text className="vss-selection-count">
        已選 <strong>{selectedCount}</strong> {itemLabel}
      </Text>
      <Space wrap size={8}>
        {children}
        <Button size="small" onClick={onClear}>取消選取</Button>
      </Space>
    </div>
  )
}
