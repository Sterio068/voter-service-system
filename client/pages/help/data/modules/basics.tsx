import React from 'react'
import { Alert, Space, Tag, Typography } from 'antd'
import {
  CalendarOutlined, TeamOutlined, FileTextOutlined,
  CheckSquareOutlined, PrinterOutlined,
} from '@ant-design/icons'
import { SubSection, StepCard } from '../../components/primitives'
import type { HelpModule } from './types'

const { Paragraph, Text } = Typography

export const BASIC_MODULES: HelpModule[] = [
  {
    id: 'voters',
    title: '選民資料管理',
    icon: <TeamOutlined />,
    color: '#34C759',
    category: 'basics',
    keywords: '選民 voter 匯入 匯出 標籤 頭銜 詳細頁 團體',
    summary: '建立並管理選民基本資料、標籤、頭銜，支援批次匯入與匯出',
    content: () => (
      <>
        <SubSection title="新增選民">
          <StepCard steps={[
            { title: '點選左側「選民資料」→「＋ 新增選民」' },
            { title: '填寫姓名（必填）、身分證號、生日、地址、電話、E-mail 等資料' },
            { title: '可選擇所屬「標籤」分類，便於後續篩選' },
            { title: '點選「儲存」完成建立' },
          ]} />
        </SubSection>
        <SubSection title="匯入/匯出">
          <Paragraph>
            支援從選民列表頁批次匯出 Excel（<Text code>.xlsx</Text>），可用 Excel 開啟並修改後重新匯入。
            匯入格式請參考下載的範本與欄位說明工作表。
          </Paragraph>
        </SubSection>
        <SubSection title="選民詳細頁">
          <Paragraph>
            點選選民姓名可進入詳細頁，可在此頁查看該選民所有陳情紀錄、備註、歷史修改紀錄。詳細頁編輯表單包含：
          </Paragraph>
          <ul>
            <li><strong>頭銜</strong>：記錄選民在地方的正式稱謂（如里長、社區主委、協會理事長）</li>
            <li><strong>標籤</strong>：樁腳、志工、捐款者等分類標籤</li>
            <li><strong>關注議題</strong>：標記選民關心的政策議題，便於精準服務</li>
          </ul>
        </SubSection>
        <SubSection title="團體管理">
          <Paragraph>
            透過左側「團體管理」可建立里長協會、社區發展協會等群組，並將選民加入團體並設定其角色與頭銜，方便統計互動紀錄。詳見「<strong>團體管理</strong>」章節。
          </Paragraph>
        </SubSection>
      </>
    ),
  },

  {
    id: 'petitions',
    title: '陳情案件管理',
    icon: <FileTextOutlined />,
    color: '#FF9500',
    category: 'basics',
    keywords: '陳情 petition 案件 進度 附件 統計',
    summary: '記錄與追蹤陳情案件，從受理到結案的完整流程',
    content: () => (
      <>
        <SubSection title="新增陳情">
          <StepCard steps={[
            { title: '按 Ctrl+N 或點選「案件列表」→「＋ 新增」' },
            { title: '填寫陳情人（可連結選民資料庫）、聯絡電話、區域、陳情標題' },
            { title: '選擇類別（需先在「類別管理」建立），指定承辦人' },
            { title: '填寫陳情內容、預期處理期限，儲存' },
          ]} />
          <Alert message="陳情人欄位輸入姓名時會自動搜尋選民資料庫，可直接連結現有選民。" type="info" showIcon style={{ marginTop: 12 }} />
        </SubSection>
        <SubSection title="進度追蹤">
          <Paragraph>
            案件狀態分為：<Tag color="orange">待處理</Tag><Tag color="blue">處理中</Tag><Tag color="cyan">已回覆</Tag><Tag>已結案</Tag>
          </Paragraph>
          <Paragraph>
            可在案件詳細頁新增處理進度記錄，每筆紀錄會自動記錄時間與操作人員。
          </Paragraph>
        </SubSection>
        <SubSection title="附件上傳">
          <Paragraph>
            進入案件詳細頁後，在「附件」區塊可上傳相關文件（圖片、PDF、Word 等），每個附件限 20MB。
          </Paragraph>
        </SubSection>
        <SubSection title="統計報表">
          <Paragraph>
            「統計報表」頁面提供案件數量、類別分布、承辦人工作量、處理時效等圖表。
          </Paragraph>
        </SubSection>
      </>
    ),
  },

  {
    id: 'schedules',
    title: '行程管理',
    icon: <CalendarOutlined />,
    color: '#AF52DE',
    category: 'basics',
    keywords: '行程 schedule 會議 拜訪 公祭 婚禮 列印 同步',
    summary: '行程建立、衝突偵測、Google 日曆同步、列印與匯出',
    content: () => (
      <>
        <SubSection title="行程類型">
          <Paragraph>
            系統內建以下行程類型，<strong>可在「類別管理 → 行程類型」自由新增或刪除</strong>（公祭為系統保護類型，無法刪除）：
          </Paragraph>
          <Space wrap style={{ marginBottom: 8 }}>
            {[
              { label: '會議', color: '#007AFF' }, { label: '拜訪', color: '#52c41a' },
              { label: '會勘', color: '#fa8c16' }, { label: '活動', color: '#722ed1' },
              { label: '餐敘', color: '#13c2c2' }, { label: '選民服務', color: '#36cfc9' },
              { label: '法律諮詢', color: '#fa541c' }, { label: '婚禮', color: '#f759ab' },
              { label: '公祭', color: '#4a1942' }, { label: '其他', color: '#8c8c8c' },
            ].map(t => (
              <Tag key={t.label} color={t.color}>{t.label}</Tag>
            ))}
          </Space>
          <Alert message="每個類型都有專屬行事曆顏色，可在類別管理中自訂顏色。" type="info" showIcon style={{ marginTop: 4 }} />
        </SubSection>

        <SubSection title="新增行程">
          <StepCard steps={[
            { title: '進入「行程管理」，選擇目標日期，點選「＋ 新增行程」' },
            { title: '填寫行程標題（必填）、開始/結束時間、地點' },
            { title: '選擇行程類型（日曆上依類型顯示不同顏色）' },
            { title: '選擇「相關團體」（可複選），便於之後在團體頁查詢互動紀錄' },
            { title: '填寫備註後儲存，系統自動同步到 Google 日曆' },
          ]} />
          <Alert message="系統會自動偵測行程時間衝突，若與現有行程重疊將顯示警告。" type="warning" showIcon style={{ marginTop: 12 }} />
        </SubSection>

        <SubSection title="公祭行程（特殊類型）">
          <Paragraph>
            選擇「公祭」時，表單額外出現專屬欄位：
          </Paragraph>
          <ul>
            <li><strong>家祭時間</strong> / <strong>公祭時間</strong>（時間選擇器）</li>
            <li><strong>靈堂地點</strong> / <strong>公祭地點</strong></li>
            <li><strong>往生者年齡</strong></li>
          </ul>
          <Paragraph>
            此外公祭也會觸發禮儀子表單，可一併記錄奠儀等送禮明細。行事曆上公祭以深紫色顯示，與一般行程明顯區隔。
          </Paragraph>
        </SubSection>

        <SubSection title="禮儀子表單（婚禮／公祭場合）">
          <Paragraph>
            行程類型選擇「婚禮」或「公祭」時，新增行程表單下方會自動出現禮儀資訊欄位：
          </Paragraph>
          <ul>
            <li><strong>禮儀性質</strong>：細分婚禮、喪禮、壽宴、彌月、開幕、升學、選舉、慰問等</li>
            <li><strong>受贈人／主家姓名</strong>（必填）、關係</li>
            <li><strong>聯合致贈</strong>：勾選後可填寫聯合人說明</li>
            <li><strong>送禮明細</strong>：可新增多筆品項，每筆可選擇禮品類別、廠商、數量、單價、付款方式</li>
          </ul>
          <Alert message="填寫後儲存，系統會同步建立禮儀記錄，並可在「行程詳情 → 禮儀記錄」分頁查看及編輯。" type="info" showIcon style={{ marginTop: 8 }} />
        </SubSection>

        <SubSection title="列印行程表 / 匯出 Word">
          <Paragraph>
            點選頁面右上角「<PrinterOutlined /> 列印行程」，選擇起始日期與天數後可選擇兩種輸出方式：
          </Paragraph>
          <ul>
            <li><strong>列印</strong>：直接觸發系統列印對話框，輸出 A4 直向格式（日期表頭藍色、時間/類型/標題/地點四欄）</li>
            <li><strong>匯出 Word</strong>：下載 .docx 格式，含頁首（機關名稱）、頁尾（列印日期＋頁碼）、彩色交替列表格</li>
          </ul>
          <Alert message="機關名稱需先至「系統設定 → 基本資訊」填寫，匯出時才會自動帶入。" type="info" showIcon style={{ marginTop: 8 }} />
        </SubSection>

        <SubSection title="Google 日曆同步">
          <Paragraph>
            行程建立、修改、刪除時，系統會自動同步到所有「已啟用」的 Google 日曆帳號。
            若同步失敗（例如 Token 過期），系統不會中斷操作，可在「系統設定 → Google 日曆」中手動重新連結。
          </Paragraph>
          <Paragraph>
            詳細設定步驟請參考「<strong>Google 日曆整合設定</strong>」章節。
          </Paragraph>
        </SubSection>
      </>
    ),
  },

  {
    id: 'tasks',
    title: '待辦事項',
    icon: <CheckSquareOutlined />,
    color: '#FF3B30',
    category: 'basics',
    keywords: '待辦 task todo 任務 截止 優先',
    summary: '建立、追蹤、分派個人或團隊待辦事項',
    content: () => (
      <>
        <SubSection title="使用方式">
          <StepCard steps={[
            { title: '按 Ctrl+T 快速新增待辦，或在「待辦事項」頁面點選「＋ 新增」' },
            { title: '填寫標題（必填）、說明、截止日期、優先級、指派人員' },
            { title: '完成後點選待辦左側核取方塊標記為完成' },
          ]} />
        </SubSection>
        <SubSection title="篩選與排序">
          <Paragraph>
            支援依「今日到期」「本週」「高優先」「我的待辦」等條件快速篩選，並可依截止日期或優先級排序。
          </Paragraph>
        </SubSection>
      </>
    ),
  },

  {
    id: 'contactRecords',
    title: '聯絡記錄',
    icon: <TeamOutlined />,
    color: '#1677ff',
    category: 'basics',
    keywords: '聯絡 contact 互動 電話 LINE 面訪',
    summary: '記錄與選民每次互動，建立完整關係時間軸',
    content: () => (
      <>
        <Paragraph>
          聯絡記錄用於記錄辦公室與選民的每次互動（電話、面訪、LINE 等），幫助掌握選民關係並追蹤重要事項的跟進情況。
        </Paragraph>
        <SubSection title="新增聯絡記錄">
          <Paragraph>有兩種方式新增：</Paragraph>
          <ul>
            <li><strong>從選民詳情頁</strong>：開啟選民 → 切換至「聯絡記錄」分頁 → 點擊「＋ 新增」，自動帶入選民資訊</li>
            <li><strong>從聯絡記錄清單</strong>：左側選單點擊「聯絡記錄」→「新增聯絡記錄」，需手動搜尋選民</li>
          </ul>
          <ul style={{ marginTop: 8 }}>
            <li><strong>聯絡日期</strong>（必填）</li>
            <li><strong>聯絡內容</strong>（必填）：記錄溝通重點</li>
            <li><strong>聯絡方式</strong>：電話 / 面訪 / LINE / 書信 / 電子郵件</li>
            <li><strong>後續追蹤</strong>：若有待辦事項可備注於此</li>
          </ul>
        </SubSection>
        <SubSection title="查閱與搜尋">
          <Paragraph>
            在「聯絡記錄」清單頁可依選民姓名、聯絡日期範圍、聯絡方式篩選。
            管理員可查看所有人員的聯絡記錄，一般人員只能查看自己新增的記錄。
          </Paragraph>
        </SubSection>
      </>
    ),
  },
]
