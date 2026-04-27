import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Button, Checkbox, Form, Input, Modal, Popconfirm, Select, Space, Tooltip, message } from 'antd'
import { DeleteOutlined, SaveOutlined, StarFilled } from '@ant-design/icons'
import api from '../utils/api'

export type SavedFilterScope = 'voter' | 'petition' | 'schedule' | 'proposal'

export interface SavedFilter {
  id: number
  scope: SavedFilterScope
  name: string
  filters: Record<string, unknown>
  is_default: boolean
  created_at: string
  updated_at: string
}

interface SavedFiltersBarProps {
  scope: SavedFilterScope
  currentFilters: Record<string, unknown>
  onApply: (filters: Record<string, unknown>) => void
  /**
   * Optional label override; defaults to 「常用篩選」.
   */
  label?: string
  /**
   * Skip auto-apply of the user's default. Use when the parent already
   * restored filters from URL or sessionStorage.
   */
  disableAutoApply?: boolean
}

function shallowSerializableObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  // Strip undefined values so the JSON payload stays small and consistent.
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v === undefined) continue
    out[k] = v
  }
  return out
}

export default function SavedFiltersBar({
  scope,
  currentFilters,
  onApply,
  label = '常用篩選',
  disableAutoApply = false,
}: SavedFiltersBarProps) {
  const [items, setItems] = useState<SavedFilter[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<number | undefined>(undefined)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm<{ name: string; is_default: boolean }>()
  const autoAppliedRef = useRef(false)

  const fetchFilters = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{ success: boolean; data: SavedFilter[] }>(
        `/saved-filters?scope=${encodeURIComponent(scope)}`
      )
      if (res.data?.success) {
        setItems(res.data.data || [])
        return res.data.data || []
      }
    } catch {
      // Silent: bar simply shows nothing when API errors.
    } finally {
      setLoading(false)
    }
    return [] as SavedFilter[]
  }, [scope])

  // Initial load + auto-apply default once per page mount.
  useEffect(() => {
    let cancelled = false
    fetchFilters().then((list) => {
      if (cancelled) return
      if (autoAppliedRef.current) return
      autoAppliedRef.current = true
      if (disableAutoApply) return
      const defaultFilter = list.find((f) => f.is_default)
      if (defaultFilter) {
        setSelectedId(defaultFilter.id)
        onApply(shallowSerializableObject(defaultFilter.filters))
      }
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope])

  const handleApply = (id: number) => {
    const target = items.find((f) => f.id === id)
    if (!target) return
    setSelectedId(id)
    onApply(shallowSerializableObject(target.filters))
  }

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/saved-filters/${id}`)
      message.success('已刪除常用篩選')
      if (selectedId === id) setSelectedId(undefined)
      await fetchFilters()
    } catch (e: any) {
      message.error(e?.response?.data?.error || '刪除失敗')
    }
  }

  const openSaveModal = () => {
    form.resetFields()
    setModalOpen(true)
  }

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      const filtersToSave = shallowSerializableObject(currentFilters)
      try {
        const res = await api.post<{ success: boolean; data: SavedFilter; error?: string }>('/saved-filters', {
          scope,
          name: values.name.trim(),
          filters: filtersToSave,
          is_default: !!values.is_default,
        })
        if (res.data?.success) {
          message.success('已儲存常用篩選')
          setModalOpen(false)
          await fetchFilters()
          if (res.data.data?.id) setSelectedId(res.data.data.id)
        }
      } catch (e: any) {
        message.error(e?.response?.data?.error || '儲存失敗')
      } finally {
        setSaving(false)
      }
    } catch {
      // form validation errors handled by Form
    }
  }

  return (
    <>
      <Space wrap size={8} aria-label={`${label}工具列`}>
        <Select
          placeholder={label}
          aria-label={label}
          allowClear
          loading={loading}
          style={{ minWidth: 180 }}
          value={selectedId}
          onChange={(v) => {
            if (v === undefined) {
              setSelectedId(undefined)
              return
            }
            handleApply(v as number)
          }}
          optionLabelProp="label"
          notFoundContent={loading ? '載入中…' : '尚無儲存的篩選'}
        >
          {items.map((f) => (
            <Select.Option
              key={f.id}
              value={f.id}
              label={f.is_default ? `★ ${f.name}` : f.name}
            >
              <Space
                style={{ width: '100%', justifyContent: 'space-between' }}
                onClick={(e) => e.stopPropagation()}
              >
                <span>
                  {f.is_default && (
                    <Tooltip title="預設篩選">
                      <StarFilled style={{ color: '#faad14', marginRight: 4 }} />
                    </Tooltip>
                  )}
                  {f.name}
                </span>
                <Popconfirm
                  title="刪除此常用篩選？"
                  okText="刪除"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                  onConfirm={(ev) => {
                    ev?.stopPropagation()
                    handleDelete(f.id)
                  }}
                  onCancel={(ev) => ev?.stopPropagation()}
                >
                  <Button
                    type="text"
                    size="small"
                    aria-label={`刪除 ${f.name}`}
                    icon={<DeleteOutlined />}
                    onClick={(e) => e.stopPropagation()}
                  />
                </Popconfirm>
              </Space>
            </Select.Option>
          ))}
        </Select>
        <Button icon={<SaveOutlined />} onClick={openSaveModal}>
          儲存目前篩選
        </Button>
      </Space>

      <Modal
        title="儲存常用篩選"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        okText="儲存"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={form} layout="vertical" initialValues={{ is_default: false }}>
          <Form.Item
            label="名稱"
            name="name"
            rules={[
              { required: true, message: '請輸入名稱' },
              { max: 60, message: '名稱最多 60 字' },
            ]}
          >
            <Input placeholder="例如：本月待處理案件" maxLength={60} autoFocus />
          </Form.Item>
          <Form.Item name="is_default" valuePropName="checked">
            <Checkbox>設為預設（下次進入此頁自動套用）</Checkbox>
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
