import React, { useState } from 'react'
import { Modal, Steps, Form, Input, Button, Result, Typography, Alert, message } from 'antd'
import { CheckCircleOutlined, LockOutlined, HomeOutlined } from '@ant-design/icons'
import api from '../utils/api'

const { Text } = Typography

interface Props {
  open: boolean
  onFinish: () => void
}

export default function FirstRunWizard({ open, onFinish }: Props) {
  const [current, setCurrent] = useState(0)
  const [officeForm] = Form.useForm()
  const [pwdForm] = Form.useForm()
  const [saving, setSaving] = useState(false)

  const steps = [
    { title: '服務處設定', icon: <HomeOutlined /> },
    { title: '修改密碼', icon: <LockOutlined /> },
    { title: '完成', icon: <CheckCircleOutlined /> },
  ]

  const handleStep0 = async () => {
    const values = await officeForm.validateFields()
    setSaving(true)
    try {
      await api.put('/admin/settings', { office_name: values.office_name })
      setCurrent(1)
    } catch (err: any) {
      message.error(err?.response?.data?.error || '服務處設定儲存失敗，請重試')
    }
    finally { setSaving(false) }
  }

  const handleStep1 = async () => {
    const values = await pwdForm.validateFields()
    setSaving(true)
    try {
      await api.put('/admin/users/1/password', {
        password: values.password,
        confirm_self_password: values.current_password,
      })
      message.success('管理員密碼已更新')
      setCurrent(2)
    } catch (err: any) {
      message.error(err?.response?.data?.error || '密碼修改失敗，請確認目前密碼後再試')
    } finally { setSaving(false) }
  }

  const handleDone = async () => {
    setSaving(true)
    try {
      const res = await api.put('/admin/settings', { first_run: 'false' })
      if (res.data.success) {
        onFinish()
      } else {
        message.error('儲存設定失敗，請重試')
      }
    } catch (err: any) {
      message.error(err?.response?.data?.error || '首次設定尚未完成，請先修改管理員密碼')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      closable={false}
      maskClosable={false}
      footer={null}
      width={560}
      title="🗳️ 歡迎使用選民服務系統"
      centered
    >
      <div style={{ padding: '16px 0' }}>
        <Steps current={current} items={steps} style={{ marginBottom: 32 }} size="small" />

        {/* Step 0: Office name */}
        {current === 0 && (
          <div>
            <Alert
              type="info"
              message="首次使用設定"
              description="請先設定您的服務處名稱，這將顯示在系統標題和列印文件中。"
              showIcon
              style={{ marginBottom: 24 }}
            />
            <Form form={officeForm} layout="vertical">
              <Form.Item
                name="office_name"
                label="服務處名稱"
                rules={[{ required: true, message: '請輸入服務處名稱' }]}
                initialValue="服務處"
              >
                <Input placeholder="例：陳○○議員服務處" size="large" />
              </Form.Item>
            </Form>
            <div style={{ textAlign: 'right', marginTop: 16 }}>
              <Button type="primary" size="large" loading={saving} onClick={handleStep0}>
                下一步 →
              </Button>
            </div>
          </div>
        )}

        {/* Step 1: Password */}
        {current === 1 && (
          <div>
            <Alert
              type="warning"
              message="必須完成管理員密碼修改"
              description={<>系統預設管理員密碼為 <Text code>admin123</Text>，請先輸入目前密碼並完成修改後，才能結束首次執行精靈。</>}
              showIcon
              style={{ marginBottom: 24 }}
            />
            <Form form={pwdForm} layout="vertical">
              <Form.Item
                name="current_password"
                label="目前密碼"
                rules={[{ required: true, message: '請輸入目前密碼' }]}
                initialValue="admin123"
              >
                <Input.Password size="large" placeholder="請輸入目前密碼" />
              </Form.Item>
              <Form.Item
                name="password"
                label="新密碼"
                rules={[
                  { required: true, message: '請輸入新密碼' },
                  { min: 8, message: '密碼至少 8 個字元' },
                ]}
              >
                <Input.Password size="large" placeholder="至少 8 個字元" />
              </Form.Item>
              <Form.Item
                name="confirm"
                label="確認密碼"
                dependencies={['password']}
                rules={[
                  { required: true, message: '請確認密碼' },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value || getFieldValue('password') === value) return Promise.resolve()
                      return Promise.reject(new Error('兩次輸入的密碼不一致'))
                    },
                  }),
                ]}
              >
                <Input.Password size="large" placeholder="再次輸入密碼" />
              </Form.Item>
            </Form>
            <div style={{ textAlign: 'right', marginTop: 16 }}>
              <Button type="primary" size="large" loading={saving} onClick={handleStep1}>
                修改密碼 →
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Done */}
        {current === 2 && (
          <div>
            <Result
              status="success"
              title="設定完成！"
              subTitle="選民服務系統已就緒，您可以開始使用所有功能。"
              extra={[
                <Button type="primary" size="large" key="done" loading={saving} onClick={handleDone}>
                  開始使用 🎉
                </Button>,
              ]}
            />
          </div>
        )}
      </div>
    </Modal>
  )
}
