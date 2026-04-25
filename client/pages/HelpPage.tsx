import React, { useState } from 'react'
import { Card, Tag, Typography } from 'antd'
import { InfoCircleOutlined } from '@ant-design/icons'
import PageScaffold from '../components/ui/PageScaffold'
import HelpHero from './help/components/HelpHero'
import HelpQuickStart from './help/components/HelpQuickStart'
import HelpScenarios from './help/components/HelpScenarios'
import HelpModuleList from './help/components/HelpModuleList'
import RoleQuickRef from './help/components/RoleQuickRef'

const { Text } = Typography

export default function HelpPage() {
  const [searchValue, setSearchValue] = useState('')

  return (
    <PageScaffold
      eyebrow="Guide Center"
      title="使用說明"
      titleLevel={4}
      variant="compact"
      description="新手導覽、情境食譜、模組索引、權限與快捷鍵，皆可從上方搜尋直接定位。"
    >
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 0 48px' }}>
        <HelpHero searchValue={searchValue} onSearchChange={setSearchValue} />

        {/* 系統小簡介卡 */}
        <Card
          size="small"
          style={{
            marginBottom: 32,
            borderRadius: 12,
            border: '1px solid #e6f4ff',
            background: 'linear-gradient(180deg, #fafbff 0%, #ffffff 100%)',
          }}
          styles={{ body: { padding: '14px 18px' } }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <InfoCircleOutlined style={{ color: '#007AFF', fontSize: 18, marginTop: 2 }} />
            <div style={{ flex: 1, fontSize: 13.5, lineHeight: 1.7 }}>
              <strong>系統需求</strong>
              <span style={{ marginLeft: 12 }}>
                <Tag color="default">macOS 12+</Tag>
                <Tag color="default">Windows 10+</Tag>
                <Tag color="blue">區網瀏覽器：Chrome / Edge / Safari</Tag>
              </span>
              <div style={{ marginTop: 6, color: '#595959' }}>
                安裝後，同一區網其他電腦可開啟瀏覽器到 <Text code>http://主機IP:8080</Text> 使用；
                需要在外網手機存取請參考下方「<strong>外網手機存取</strong>」模組。
              </div>
            </div>
          </div>
        </Card>

        <HelpQuickStart />

        <HelpScenarios searchValue={searchValue} />

        <HelpModuleList searchValue={searchValue} />

        <RoleQuickRef />
      </div>
    </PageScaffold>
  )
}
