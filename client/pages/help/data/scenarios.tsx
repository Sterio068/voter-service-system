import React from 'react'
import { Tag, Typography } from 'antd'
import {
  PhoneOutlined, GiftOutlined, ProfileOutlined, SwapOutlined,
  BarChartOutlined, UserAddOutlined,
} from '@ant-design/icons'

const { Paragraph, Text } = Typography

export type HelpScenario = {
  id: string
  title: string
  /** 1-line subtitle */
  subtitle: string
  icon: React.ReactNode
  color: string
  /** Modules involved (renders chips) */
  moduleIds: string[]
  /** Estimated time in minutes */
  estimatedMin: number
  /** Detail content (rendered inside modal) */
  body: () => React.ReactNode
}

export const HELP_SCENARIOS: HelpScenario[] = [
  {
    id: 'voter-call-petition',
    title: '選民來電陳情',
    subtitle: '從接到電話到結案完整 5 步驟',
    icon: <PhoneOutlined />,
    color: '#FF9500',
    moduleIds: ['voters', 'petitions', 'schedules', 'tasks', 'contactRecords'],
    estimatedMin: 5,
    body: () => (
      <>
        <Paragraph>
          辦公室最常見的入口情境。透過全站搜尋找選民，建立陳情，安排回訪，並設定追蹤待辦，所有資訊串成完整時間軸。
        </Paragraph>
        <ol>
          <li>
            <strong>找選民</strong>：按 <Text keyboard>Ctrl + K</Text> 開啟全站搜尋，輸入姓名或手機快速定位。
            若是新選民，於「選民資料 → ＋ 新增選民」建立基本資料。
          </li>
          <li>
            <strong>建立陳情</strong>：按 <Text keyboard>Ctrl + N</Text> 開啟陳情表單，<Tag color="blue">陳情人</Tag> 欄位輸入姓名會自動連結選民資料庫。
            選擇類別、區域、承辦人，描述內容後儲存。
          </li>
          <li>
            <strong>安排回訪</strong>：在陳情詳細頁右側點「相關行程 → 新增」，類型選「拜訪」或「會勘」，系統自動關聯這筆陳情。
          </li>
          <li>
            <strong>設定追蹤待辦</strong>：按 <Text keyboard>Ctrl + T</Text> 新增待辦，填寫截止日期與優先級，指派承辦人。
          </li>
          <li>
            <strong>結案與滿意度</strong>：處理完畢後在陳情詳細頁將狀態切為「已結案」，可同時填寫滿意度評分。
            「統計報表 → 滿意度分析」會即時更新。
          </li>
        </ol>
      </>
    ),
  },

  {
    id: 'public-funeral',
    title: '公祭場合處理',
    subtitle: '建立公祭行程並登記禮儀記錄',
    icon: <GiftOutlined />,
    color: '#722ed1',
    moduleIds: ['schedules', 'ceremonies', 'vendors'],
    estimatedMin: 4,
    body: () => (
      <>
        <Paragraph>
          公祭是系統內建的特殊行程類型，會自動觸發禮儀子表單，把行程與禮儀記錄一次完成。
        </Paragraph>
        <ol>
          <li>
            <strong>新增行程</strong>：行程管理 → ＋ 新增行程，類型選「公祭」（深紫色標籤）。
          </li>
          <li>
            <strong>填家祭/公祭資訊</strong>：填寫家祭時間、公祭時間、靈堂地點、公祭地點、往生者年齡。
          </li>
          <li>
            <strong>填禮儀子表單</strong>：表單下方自動展開禮儀資訊，填寫主家姓名、關係，並逐筆「＋ 新增品項」明細（花籃、奠儀…），帶入廠商與單價。
          </li>
          <li>
            <strong>儲存後自動關聯</strong>：行程詳情頁的「禮儀記錄」分頁可直接編輯，行事曆同步到 Google。
          </li>
          <li>
            <strong>列印行程表</strong>：當天行程多時，右上「列印行程」可選擇「匯出 Word」帶機關抬頭。
          </li>
        </ol>
      </>
    ),
  },

  {
    id: 'proposal-tracking',
    title: '議員提案進度追蹤',
    subtitle: 'AI 自動匯入議會公報原文',
    icon: <ProfileOutlined />,
    color: '#722ed1',
    moduleIds: ['proposals', 'ai', 'reports'],
    estimatedMin: 3,
    body: () => (
      <>
        <Paragraph>
          只需貼上議會公報原文，AI 會自動解析編號、日期、提案人、連署人、內容等欄位。
        </Paragraph>
        <ol>
          <li>
            <strong>確認 AI 設定</strong>：系統設定 → AI 助理設定，至少完成 Gemini / OpenAI / Ollama 其一的設定並通過「測試連線」。
          </li>
          <li>
            <strong>AI 匯入</strong>：提案追蹤 → 新增提案 → 表單右上「AI 匯入」，貼上文字（最多 8,000 字）→ 解析 → 套用。
          </li>
          <li>
            <strong>補欄位、設定狀態</strong>：補上類型、屆次、類別等 AI 沒抓到的欄位，狀態先設「待審議」。
          </li>
          <li>
            <strong>後續追蹤</strong>：每次議會結果出爐後更新狀態（審議中 → 通過/否決），備註欄旁可用「AI 建議」自動產生跟進重點。
          </li>
          <li>
            <strong>月報統計</strong>：頁面頂端統計列即時顯示各狀態件數，月底匯出 Excel 給選民服務報告。
          </li>
        </ol>
      </>
    ),
  },

  {
    id: 'staff-handover',
    title: '人員交接（離職／轉調）',
    subtitle: '一鍵把陳情、公文、待辦轉給接手者',
    icon: <SwapOutlined />,
    color: '#FF9500',
    moduleIds: ['handover', 'tasks', 'petitions'],
    estimatedMin: 2,
    body: () => (
      <>
        <Paragraph>
          人員異動時，原承辦人手上的所有業務一次轉移給接手者，避免逐筆改派。
        </Paragraph>
        <ol>
          <li>
            <strong>進入「員工交接」頁</strong>（僅管理員可操作）。
          </li>
          <li>
            <strong>選擇移出人員</strong>：離職或轉調的員工。
          </li>
          <li>
            <strong>選擇接手人員</strong>：接收業務的員工。
          </li>
          <li>
            <strong>確認轉移項目</strong>：系統列出該員所有陳情、公文、待辦的件數預覽。
          </li>
          <li>
            <strong>執行交接</strong>：點選「執行交接」一次完成，操作紀錄於「操作紀錄」頁可追蹤。
          </li>
          <li>
            <strong>停用帳號</strong>：交接完成後到「帳號維護」把離職者帳號改為停用（不刪除以保留稽核）。
          </li>
        </ol>
      </>
    ),
  },

  {
    id: 'annual-report',
    title: '年度業務總結報告',
    subtitle: '快速產出年度數據',
    icon: <BarChartOutlined />,
    color: '#52c41a',
    moduleIds: ['reports', 'expenses', 'petitions'],
    estimatedMin: 5,
    body: () => (
      <>
        <Paragraph>
          年底要做選民服務年報時，把報表頁的關鍵數字一次帶出，輔以收支與滿意度。
        </Paragraph>
        <ol>
          <li>
            <strong>切換年份</strong>：報表頁右上選擇目標年份，所有圖表即時刷新。
          </li>
          <li>
            <strong>陳情總量、結案率</strong>：頁面頂部 4 張 MetricCard 直接看到，<Tag color="blue">結案率</Tag>顏色會依百分比變化。
          </li>
          <li>
            <strong>類別與區域分佈</strong>：「類別分布」「區域熱力圖」呈現服務重點，可匯出 Excel。
          </li>
          <li>
            <strong>承辦人工作量</strong>：「負責人工作量」報表用於人員考核或加減人員規劃。
          </li>
          <li>
            <strong>禮儀年度支出</strong>：收支統計頁查看年度總支出 / 預算進度條 / 廠商排名。
          </li>
          <li>
            <strong>匯出 Excel</strong>：每張表單右上「匯出」鈕下載原始數據，自由整合進外部簡報。
          </li>
        </ol>
      </>
    ),
  },

  {
    id: 'new-staff-onboarding',
    title: '新員工上手第一天',
    subtitle: '建帳號、學權限、做練習',
    icon: <UserAddOutlined />,
    color: '#13c2c2',
    moduleIds: ['settings', 'tasks', 'petitions'],
    estimatedMin: 10,
    body: () => (
      <>
        <Paragraph>
          帶領新進助理／志工在第一天完成基礎操作，10 分鐘內熟悉介面。
        </Paragraph>
        <ol>
          <li>
            <strong>建立帳號</strong>：管理員到「帳號維護」新增使用者，指定角色（<Tag color="red">管理員</Tag><Tag color="orange">主管</Tag><Tag color="blue">助理</Tag><Tag>志工</Tag>）。
          </li>
          <li>
            <strong>說明權限差異</strong>：開啟「使用說明 → 角色權限總表」對照可看可改的模組。
          </li>
          <li>
            <strong>練習 1：搜尋選民</strong>：按 <Text keyboard>Ctrl + K</Text>，搜尋任一姓名或手機。
          </li>
          <li>
            <strong>練習 2：建立陳情</strong>：按 <Text keyboard>Ctrl + N</Text>，依教學跑完一遍流程。
          </li>
          <li>
            <strong>練習 3：新增待辦</strong>：按 <Text keyboard>Ctrl + T</Text>，建立第一個待辦並指派給自己。
          </li>
          <li>
            <strong>互動工具</strong>：右上角 <Tag>?</Tag> 可隨時打開快捷鍵浮動提示；左上 ❓ 跳到本說明頁複習。
          </li>
        </ol>
      </>
    ),
  },
]
