import React from 'react'
import { Button, Space } from 'antd'

interface FormFooterProps {
  onCancel: () => void
  onSubmit: () => void
  cancelText?: string
  submitText?: string
  submitLoading?: boolean
  submitDisabled?: boolean
  extra?: React.ReactNode
}

export default function FormFooter({
  onCancel,
  onSubmit,
  cancelText = '取消',
  submitText = '儲存',
  submitLoading = false,
  submitDisabled = false,
  extra,
}: FormFooterProps) {
  return (
    <div className="vss-form-footer">
      <Space wrap>
        <Button onClick={onCancel}>{cancelText}</Button>
        {extra}
        <Button type="primary" loading={submitLoading} disabled={submitDisabled} onClick={onSubmit}>
          {submitText}
        </Button>
      </Space>
    </div>
  )
}
