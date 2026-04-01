import React, { useState, useRef } from 'react'
import {
  Modal, Steps, Button, Form, Select, Input, DatePicker, Space,
  Typography, Tag, Tooltip, message, Divider, Alert
} from 'antd'
import { PhoneOutlined, UserAddOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import api from '../utils/api'
import dayjs from 'dayjs'

const { Text } = Typography
const { Option } = Select
const { Step } = Steps

type CallStep = 0 | 1 | 2 | 3 | 4  // 4 = success
type CallError = { step: CallStep; message: string } | null

const DRAFT_KEY = 'call_handler_draft'

interface CreatedRecord {
  contactId?: number
  petitionId?: number
  taskId?: number
}

interface DraftData {
  currentStep: CallStep
  selectedVoter: any
  isUnknownCaller: boolean
  contactValues: any
  resultType: string
  isPetition: boolean | null
  petitionContent: string
  createTask: boolean | null
  taskTitle: string
  taskDueDateStr: string | null
}

export default function CallHandlerModal() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [currentStep, setCurrentStep] = useState<CallStep>(0)
  const [callError, setCallError] = useState<CallError>(null)
  const [draftRestorePrompt, setDraftRestorePrompt] = useState(false)
  const [pendingDraft, setPendingDraft] = useState<DraftData | null>(null)

  // Step 1 state
  const [voterOptions, setVoterOptions] = useState<any[]>([])
  const [voterSearchLoading, setVoterSearchLoading] = useState(false)
  const [selectedVoter, setSelectedVoter] = useState<any>(null)
  const [isUnknownCaller, setIsUnknownCaller] = useState(false)

  // Step 2 state
  const [contactForm] = Form.useForm()
  const [resultType, setResultType] = useState<string>('')

  // Step 3 state
  const [isPetition, setIsPetition] = useState<boolean | null>(null)
  const [petitionContent, setPetitionContent] = useState('')

  // Step 4 state
  const [createTask, setCreateTask] = useState<boolean | null>(null)
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDueDate, setTaskDueDate] = useState<dayjs.Dayjs | null>(null)

  // Submission state
  const [submitting, setSubmitting] = useState(false)
  const [created, setCreated] = useState<CreatedRecord | null>(null)

  const saveDraft = () => {
    if (currentStep === 0) return // nothing to save yet
    const draft: DraftData = {
      currentStep,
      selectedVoter,
      isUnknownCaller,
      contactValues: contactForm.getFieldsValue(),
      resultType,
      isPetition,
      petitionContent,
      createTask,
      taskTitle,
      taskDueDateStr: taskDueDate ? taskDueDate.format('YYYY-MM-DD') : null,
    }
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  }

  const clearDraft = () => {
    sessionStorage.removeItem(DRAFT_KEY)
  }

  const resetAll = () => {
    setCurrentStep(0)
    setCallError(null)
    setSelectedVoter(null)
    setIsUnknownCaller(false)
    setVoterOptions([])
    contactForm.resetFields()
    setResultType('')
    setIsPetition(null)
    setPetitionContent('')
    setCreateTask(null)
    setTaskTitle('')
    setTaskDueDate(null)
    setCreated(null)
  }

  const restoreDraft = (draft: DraftData) => {
    setCurrentStep(draft.currentStep)
    setSelectedVoter(draft.selectedVoter)
    setIsUnknownCaller(draft.isUnknownCaller)
    contactForm.setFieldsValue(draft.contactValues || {})
    setResultType(draft.resultType || '')
    setIsPetition(draft.isPetition)
    setPetitionContent(draft.petitionContent || '')
    setCreateTask(draft.createTask)
    setTaskTitle(draft.taskTitle || '')
    setTaskDueDate(draft.taskDueDateStr ? dayjs(draft.taskDueDateStr) : null)
    clearDraft()
    setDraftRestorePrompt(false)
    setPendingDraft(null)
  }

  const handleOpen = () => {
    // Check for saved draft
    const raw = sessionStorage.getItem(DRAFT_KEY)
    if (raw) {
      try {
        const draft = JSON.parse(raw) as DraftData
        setPendingDraft(draft)
        setDraftRestorePrompt(true)
        setOpen(true)
        return
      } catch {}
    }
    resetAll()
    setOpen(true)
  }

  const handleClose = () => {
    if (currentStep >= 1 && currentStep <= 3 && !created) {
      saveDraft()
    }
    setOpen(false)
    setDraftRestorePrompt(false)
    setPendingDraft(null)
  }

  const handleVoterSearch = async (value: string) => {
    if (!value || value.length < 1) { setVoterOptions([]); return }
    setVoterSearchLoading(true)
    try {
      const res = await api.get(`/voters?search=${encodeURIComponent(value)}&pageSize=10`)
      setVoterOptions(res.data.data || [])
    } catch {}
    setVoterSearchLoading(false)
  }

  const handleVoterSelect = (value: number, option: any) => {
    setSelectedVoter(option?.voter || null)
  }

  // Step 1 → Step 2
  const goStep1 = () => {
    setCurrentStep(1)
  }

  // Step 2 → Step 3
  const goStep2 = async () => {
    try {
      await contactForm.validateFields()
      setCurrentStep(2)
    } catch {}
  }

  // Step 3 → Step 4
  const goStep3 = (answer: boolean) => {
    setIsPetition(answer)
    setCurrentStep(3)
  }

  // Final submit
  const handleFinish = async () => {
    setSubmitting(true)
    setCallError(null)
    const result: CreatedRecord = {}
    try {
      // Step 2: POST contact record
      const contactValues = contactForm.getFieldsValue()
      const contactPayload: any = {
        voter_id: selectedVoter?.id || null,
        contact_date: contactValues.contact_date
          ? dayjs(contactValues.contact_date).format('YYYY-MM-DD')
          : dayjs().format('YYYY-MM-DD'),
        contact_method: contactValues.contact_method || 'phone',
        result_type: contactValues.result_type,
        summary: contactValues.content,
        follow_up_date: contactValues.follow_up_date
          ? dayjs(contactValues.follow_up_date).format('YYYY-MM-DD')
          : undefined,
      }

      if (selectedVoter?.id) {
        const contactRes = await api.post(`/voters/${selectedVoter.id}/contacts`, contactPayload).catch((err) => {
          throw { step: 3 as CallStep, message: `儲存聯絡紀錄失敗：${err?.response?.data?.error || err?.message || '未知錯誤'}` }
        })
        if (contactRes?.data?.data?.id) result.contactId = contactRes.data.data.id
      }

      // Step 3: POST petition if needed
      if (isPetition && petitionContent && selectedVoter?.id) {
        const petitionRes = await api.post('/petitions', {
          voter_id: selectedVoter.id,
          content: petitionContent,
          petition_date: dayjs().format('YYYY-MM-DD'),
          status: 'pending',
        }).catch((err) => {
          throw { step: 3 as CallStep, message: `建立陳情失敗：${err?.response?.data?.error || err?.message || '未知錯誤'}` }
        })
        if (petitionRes?.data?.data?.id) result.petitionId = petitionRes.data.data.id
      }

      // Step 4: POST task if needed
      if (createTask && taskTitle) {
        const taskRes = await api.post('/tasks', {
          title: taskTitle,
          related_voter_id: selectedVoter?.id || undefined,
          due_date: taskDueDate ? taskDueDate.format('YYYY-MM-DD') : undefined,
          priority: 'normal',
          status: 'pending',
        }).catch((err) => {
          throw { step: 3 as CallStep, message: `建立待辦失敗：${err?.response?.data?.error || err?.message || '未知錯誤'}` }
        })
        if (taskRes?.data?.data?.id) result.taskId = taskRes.data.data.id
      }

      setCreated(result)
      setCurrentStep(4)
      clearDraft()
    } catch (err: any) {
      if (err?.step !== undefined) {
        setCallError({ step: err.step, message: err.message })
      } else {
        setCallError({ step: currentStep, message: '儲存失敗，請重試' })
      }
    } finally {
      setSubmitting(false)
    }
  }

  const stepItems = [
    { title: '搜尋來電者' },
    { title: '記錄聯絡' },
    { title: '是否立案' },
    { title: '追蹤待辦' },
  ]

  const renderError = () => {
    if (!callError) return null
    return (
      <Alert
        type="error"
        message={callError.message}
        style={{ marginBottom: 12 }}
        action={
          <Button size="small" onClick={() => { setCallError(null); handleFinish() }}>
            重試
          </Button>
        }
        closable
        onClose={() => setCallError(null)}
      />
    )
  }

  const renderStep = () => {
    if (draftRestorePrompt && pendingDraft) {
      return (
        <div>
          <Alert
            type="info"
            showIcon
            message="發現未完成的來電記錄草稿"
            description={`上次進行到第 ${pendingDraft.currentStep} 步${pendingDraft.selectedVoter ? `，來電者：${pendingDraft.selectedVoter.name}` : ''}。是否還原？`}
            style={{ marginBottom: 16 }}
          />
          <div style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => {
                clearDraft()
                setDraftRestorePrompt(false)
                setPendingDraft(null)
                resetAll()
              }}>
                捨棄草稿，重新開始
              </Button>
              <Button type="primary" onClick={() => restoreDraft(pendingDraft)}>
                還原草稿
              </Button>
            </Space>
          </div>
        </div>
      )
    }

    if (currentStep === 0) {
      return (
        <div>
          <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
            搜尋來電選民（或跳過以繼續）
          </Text>
          <Select
            showSearch
            style={{ width: '100%' }}
            placeholder="輸入姓名或手機號碼搜尋..."
            filterOption={false}
            loading={voterSearchLoading}
            onSearch={handleVoterSearch}
            onSelect={handleVoterSelect}
            options={voterOptions.map(v => ({
              value: v.id,
              label: `${v.name}${v.mobile ? ` (${v.mobile})` : ''}`,
              voter: v,
            }))}
            allowClear
            onClear={() => setSelectedVoter(null)}
          />
          {selectedVoter && (
            <Alert
              style={{ marginTop: 12 }}
              type="success"
              showIcon
              message={`已選擇：${selectedVoter.name}${selectedVoter.mobile ? ` (${selectedVoter.mobile})` : ''}`}
            />
          )}
          <Divider style={{ margin: '16px 0 8px' }}>或</Divider>
          <Button
            icon={<UserAddOutlined />}
            block
            onClick={() => { setIsUnknownCaller(true); setSelectedVoter(null); goStep1() }}
          >
            不明來電，直接跳過
          </Button>
          <div style={{ textAlign: 'right', marginTop: 16 }}>
            <Space>
              <Button onClick={handleClose}>取消</Button>
              <Button type="primary" onClick={goStep1}>
                {selectedVoter ? '下一步' : '跳過，繼續記錄'}
              </Button>
            </Space>
          </div>
        </div>
      )
    }

    if (currentStep === 1) {
      return (
        <div>
          {selectedVoter && (
            <Alert
              style={{ marginBottom: 12 }}
              type="info"
              showIcon
              message={`來電者：${selectedVoter.name}`}
            />
          )}
          {renderError()}
          <Form form={contactForm} layout="vertical">
            <Form.Item name="contact_method" label="聯絡方式" initialValue="phone">
              <Select>
                <Option value="phone">電話</Option>
                <Option value="visit">來訪</Option>
                <Option value="line">LINE</Option>
                <Option value="email">電子郵件</Option>
                <Option value="other">其他</Option>
              </Select>
            </Form.Item>
            <Form.Item name="content" label="聯絡內容" rules={[{ required: true, message: '請輸入聯絡內容' }]}>
              <Input.TextArea rows={3} placeholder="簡述來電內容..." />
            </Form.Item>
            <Form.Item name="result_type" label="聯絡結果" rules={[{ required: true, message: '請選擇聯絡結果' }]}>
              <Select onChange={(v) => setResultType(v)}>
                <Option value="contacted">已聯絡</Option>
                <Option value="pending_reply">待回覆</Option>
                <Option value="no_answer">未接</Option>
                <Option value="completed">已完成</Option>
              </Select>
            </Form.Item>
            {(resultType === 'pending_reply' || resultType === 'no_answer') && (
              <Form.Item name="follow_up_date" label="追蹤日期">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            )}
          </Form>
          <div style={{ textAlign: 'right', marginTop: 8 }}>
            <Space>
              <Button onClick={() => setCurrentStep(0)}>上一步</Button>
              <Button type="primary" onClick={goStep2}>下一步</Button>
            </Space>
          </div>
        </div>
      )
    }

    if (currentStep === 2) {
      return (
        <div>
          {renderError()}
          <Text style={{ display: 'block', marginBottom: 20, fontSize: 16 }}>
            此次來電是否需要<strong>立案陳情</strong>？
          </Text>
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <Button
              type={isPetition === true ? 'primary' : 'default'}
              block size="large"
              onClick={() => setIsPetition(true)}
            >
              是，需要立案
            </Button>
            <Button
              type={isPetition === false ? 'primary' : 'default'}
              block size="large"
              onClick={() => setIsPetition(false)}
            >
              否，不需要立案
            </Button>
          </Space>

          {isPetition === true && (
            <div style={{ marginTop: 16 }}>
              <Text type="secondary">陳情內容：</Text>
              <Input.TextArea
                style={{ marginTop: 8 }}
                rows={3}
                value={petitionContent}
                onChange={e => setPetitionContent(e.target.value)}
                placeholder="請輸入陳情內容..."
              />
            </div>
          )}

          <div style={{ textAlign: 'right', marginTop: 20 }}>
            <Space>
              <Button onClick={() => setCurrentStep(1)}>上一步</Button>
              <Button
                type="primary"
                onClick={() => goStep3(isPetition === true)}
                disabled={isPetition === null}
              >
                下一步
              </Button>
            </Space>
          </div>
        </div>
      )
    }

    if (currentStep === 3) {
      return (
        <div>
          {renderError()}
          <Text style={{ display: 'block', marginBottom: 20, fontSize: 16 }}>
            是否建立<strong>追蹤待辦</strong>？
          </Text>
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <Button
              type={createTask === true ? 'primary' : 'default'}
              block size="large"
              onClick={() => setCreateTask(true)}
            >
              是，建立追蹤待辦
            </Button>
            <Button
              type={createTask === false ? 'primary' : 'default'}
              block size="large"
              onClick={() => setCreateTask(false)}
            >
              否，不需要
            </Button>
          </Space>

          {createTask === true && (
            <div style={{ marginTop: 16 }}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Input
                  placeholder="待辦標題..."
                  value={taskTitle}
                  onChange={e => setTaskTitle(e.target.value)}
                />
                <DatePicker
                  style={{ width: '100%' }}
                  placeholder="截止日期"
                  value={taskDueDate}
                  onChange={v => setTaskDueDate(v)}
                />
              </Space>
            </div>
          )}

          {/* Summary */}
          <Divider />
          <Text type="secondary" style={{ fontSize: 12 }}>摘要：</Text>
          <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>
            {selectedVoter ? `來電者：${selectedVoter.name}` : '來電者：不明'}
            {isPetition ? '　｜　將立案陳情' : ''}
          </div>

          <div style={{ textAlign: 'right', marginTop: 20 }}>
            <Space>
              <Button onClick={() => setCurrentStep(2)}>上一步</Button>
              <Button
                type="primary"
                loading={submitting}
                onClick={handleFinish}
                disabled={createTask === null}
              >
                完成
              </Button>
            </Space>
          </div>
        </div>
      )
    }

    if (currentStep === 4 && created) {
      return (
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <Text style={{ fontSize: 18, display: 'block', marginBottom: 16 }}>完成！</Text>
          <Space direction="vertical" size="small">
            {created.contactId && selectedVoter?.id && (
              <Tag
                color="blue"
                style={{ cursor: 'pointer' }}
                onClick={() => { navigate(`/voters/${selectedVoter.id}?tab=contacts`); handleClose() }}
              >
                聯絡記錄已建立 #{created.contactId}（點擊查看）
              </Tag>
            )}
            {created.contactId && !selectedVoter?.id && (
              <Tag color="blue">聯絡記錄已建立 #{created.contactId}</Tag>
            )}
            {created.petitionId && (
              <Tag
                color="green"
                style={{ cursor: 'pointer' }}
                onClick={() => { navigate(`/petitions/${created.petitionId}`); handleClose() }}
              >
                陳情案件已建立 #{created.petitionId}（點擊查看）
              </Tag>
            )}
            {created.taskId && (
              <Tag
                color="purple"
                style={{ cursor: 'pointer' }}
                onClick={() => { navigate('/tasks'); handleClose() }}
              >
                待辦事項已建立 #{created.taskId}（點擊查看）
              </Tag>
            )}
          </Space>
          <div style={{ marginTop: 24 }}>
            <Button type="primary" onClick={() => { clearDraft(); handleClose() }}>關閉</Button>
          </div>
        </div>
      )
    }

    return null
  }

  return (
    <>
      <Tooltip title="來電處理">
        <Button
          type="text"
          icon={<PhoneOutlined />}
          onClick={handleOpen}
          style={{ fontSize: 16, color: '#52c41a' }}
        />
      </Tooltip>
      <Modal
        title={
          <Space>
            <PhoneOutlined style={{ color: '#52c41a' }} />
            <span>來電處理</span>
          </Space>
        }
        open={open}
        onCancel={handleClose}
        footer={null}
        width={520}
        destroyOnHidden
      >
        {!draftRestorePrompt && (
          <Steps
            current={currentStep < 4 ? currentStep : 3}
            size="small"
            style={{ marginBottom: 24 }}
            items={stepItems}
          />
        )}
        {renderStep()}
      </Modal>
    </>
  )
}
