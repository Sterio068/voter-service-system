import React from 'react'
import { Tag, Typography } from 'antd'

const { Paragraph, Text } = Typography

export type QuickStartStep = {
  title: string
  description: React.ReactNode
}

export const QUICK_START_STEPS: QuickStartStep[] = [
  {
    title: '認識首頁',
    description: (
      <Paragraph style={{ marginTop: 4 }}>
        左側是模組選單、上方是搜尋與使用者選單。首頁顯示今日待辦、即將到來的行程、最近陳情與系統提醒，是每天進辦公室第一個打開的頁面。
      </Paragraph>
    ),
  },
  {
    title: '搜尋一位選民',
    description: (
      <Paragraph style={{ marginTop: 4 }}>
        按 <Text keyboard>Ctrl + K</Text> 開啟全站搜尋，輸入姓名或手機。如果尚未登錄這位選民，到「選民資料 → ＋ 新增選民」建立。
      </Paragraph>
    ),
  },
  {
    title: '建立第一筆陳情',
    description: (
      <Paragraph style={{ marginTop: 4 }}>
        按 <Text keyboard>Ctrl + N</Text> 開啟陳情表單。填入陳情人（會自動連結選民資料）、聯絡電話、區域、類別、承辦人、內容，儲存即完成。
        儲存後可在詳細頁繼續上傳附件、新增處理進度。
      </Paragraph>
    ),
  },
  {
    title: '安排一個行程',
    description: (
      <Paragraph style={{ marginTop: 4 }}>
        按 <Text keyboard>Ctrl + B</Text> 開啟今日行程，點 <Tag color="blue">＋ 新增行程</Tag> 填寫標題、時間、地點、類型。
        若 Google 日曆已連結，會自動同步。
      </Paragraph>
    ),
  },
  {
    title: '建立一個待辦',
    description: (
      <Paragraph style={{ marginTop: 4 }}>
        按 <Text keyboard>Ctrl + T</Text> 快速新增待辦，填標題、截止日期、優先級。
        按 <Text keyboard>Ctrl + Shift + D</Text> 隨時打開「今日待辦」清單。
      </Paragraph>
    ),
  },
  {
    title: '探索更多',
    description: (
      <Paragraph style={{ marginTop: 4 }}>
        熟悉以上 5 步後，往下看「常見情境食譜」與「模組索引」。任何頁面按 <Text keyboard>?</Text> 可顯示完整快捷鍵清單；
        本頁頂部的搜尋框可即時過濾整份說明。
      </Paragraph>
    ),
  },
]
