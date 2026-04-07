import React, { useState } from 'react'
import { Button, Tooltip, message } from 'antd'
import { RobotOutlined, LoadingOutlined } from '@ant-design/icons'
import api from '../../utils/api'

interface AIButtonProps {
  label?: string
  tooltip?: string
  endpoint: string
  payload: Record<string, any>
  onResult: (data: any) => void
  size?: 'small' | 'middle' | 'large'
  type?: 'default' | 'primary' | 'dashed' | 'link' | 'text'
  icon?: React.ReactNode
  disabled?: boolean
}

export default function AIButton({
  label = 'AI',
  tooltip,
  endpoint,
  payload,
  onResult,
  size = 'small',
  type = 'default',
  icon,
  disabled,
}: AIButtonProps) {
  const [loading, setLoading] = useState(false)

  const handleClick = async () => {
    setLoading(true)
    try {
      const res = await api.post(endpoint, payload)
      onResult(res.data.data)
    } catch (e: any) {
      const msg = e?.response?.data?.error || '操作失敗'
      if (msg.includes('尚未啟用') || msg.includes('尚未設定')) {
        message.warning({ content: msg + '（系統設定 → AI 助理）', duration: 4 })
      } else {
        message.error(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Tooltip title={tooltip || label}>
      <Button
        size={size}
        type={type}
        icon={loading ? <LoadingOutlined /> : (icon || <RobotOutlined />)}
        onClick={handleClick}
        disabled={disabled || loading}
      >
        {label}
      </Button>
    </Tooltip>
  )
}
