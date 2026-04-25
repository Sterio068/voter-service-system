import React from 'react'
import { Alert, Tag, Typography } from 'antd'
import {
  TeamOutlined, FileTextOutlined, MailOutlined,
  InfoCircleOutlined, GiftOutlined, ShopOutlined, DollarOutlined,
  ProfileOutlined,
} from '@ant-design/icons'
import { SubSection, StepCard } from '../../components/primitives'
import type { HelpModule } from './types'

const { Paragraph, Text } = Typography

export const ADVANCED_MODULES: HelpModule[] = [
  {
    id: 'documents',
    title: '公文管理',
    icon: <MailOutlined />,
    color: '#5AC8FA',
    category: 'advanced',
    keywords: '公文 document 收文 發文 函 word 匯出',
    summary: '收發公文記錄、Word 格式匯出、政府公文格式輸出',
    content: () => (
      <>
        <SubSection title="收文 / 發文">
          <Paragraph>
            系統分為「收文」與「發文」兩個分頁。收文記錄來自外部機關的公文；發文記錄本服務處對外發出的公文。
          </Paragraph>
        </SubSection>
        <SubSection title="新增公文">
          <StepCard steps={[
            { title: '選擇「收文」或「發文」分頁，點選「＋ 新增」' },
            { title: '填寫發文字號、日期、對象機關、主旨' },
            { title: '說明欄位：每行代表一個條列項目（匯出時自動編號）' },
            { title: '指定承辦人、類別、處理期限' },
            { title: '儲存後可上傳相關附件' },
          ]} />
        </SubSection>
        <SubSection title="匯出正式公文（Word）">
          <Paragraph>
            開啟公文詳情後，點選右上角「匯出 Word」，即可下載符合政府公文格式的 <Text code>.doc</Text> 檔案。格式結構如下：
          </Paragraph>
          <div style={{ background: '#f9f9f9', border: '1px solid #e0e0e0', borderRadius: 8, padding: '12px 20px', fontFamily: 'serif', lineHeight: 2.2, fontSize: 13 }}>
            <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: 16, letterSpacing: 4 }}>○○服務處</div>
            <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: 15, letterSpacing: 6, marginBottom: 4 }}>函</div>
            <div style={{ fontSize: 12, lineHeight: 1.9 }}>地　　址：○○市○○路○段○號</div>
            <div style={{ fontSize: 12, lineHeight: 1.9 }}>聯 絡 人：王小明</div>
            <div style={{ fontSize: 12, lineHeight: 1.9 }}>電　　話：(02)2XXX-XXXX</div>
            <div style={{ fontSize: 12, lineHeight: 1.9 }}>傳　　真：(02)2XXX-XXXX</div>
            <div style={{ fontSize: 12, lineHeight: 1.9, marginBottom: 4 }}>電子信箱：service@example.gov.tw</div>
            <div>受文者：○○機關</div>
            <div>發文日期：中華民國○○○年○○月○○日</div>
            <div>發文字號：○○字第○○○○號</div>
            <div>速　　別：普通件</div>
            <div>密等及解密條件或保密期限：普通</div>
            <div>附　　件：無</div>
            <div style={{ marginTop: 8 }}>主　　旨：○○○○。</div>
            <div>說　　明：</div>
            <div style={{ marginLeft: '2em' }}>一、○○○○。</div>
            <div style={{ marginLeft: '2em' }}>二、○○○○。</div>
            <div style={{ marginTop: 8, fontSize: 12 }}>正　　本：○○機關</div>
            <div style={{ fontSize: 12 }}>副　　本：</div>
            <div style={{ textAlign: 'right', marginTop: 12 }}>○○服務處　<br />首長：</div>
          </div>
          <Alert message="地址、聯絡人、電話、傳真、電子信箱須先至「系統設定 → 基本資訊」填寫，匯出時才會自動帶入。" type="info" showIcon style={{ marginTop: 10 }} />
        </SubSection>
      </>
    ),
  },

  {
    id: 'ceremonies',
    title: '禮儀記錄管理',
    icon: <GiftOutlined />,
    color: '#eb2f96',
    category: 'advanced',
    keywords: '禮儀 ceremony 婚禮 喪禮 奠儀 禮金 送禮',
    summary: '送禮往來明細、付款狀態、年度支出統計',
    content: () => (
      <>
        <Paragraph>
          記錄婚喪喜慶等各類場合的送禮往來，包含品項明細、廠商、付款狀態，可與行程管理串聯，也可獨立維護。
        </Paragraph>
        <SubSection title="新增禮儀記錄">
          <StepCard steps={[
            { title: '方式一：左側選單「禮儀記錄」→ 右上角「新增禮儀記錄」' },
            { title: '方式二：新增/查看行程 → 「禮儀記錄」分頁 → 「＋ 新增禮儀記錄」以自動關聯行程' },
            { title: '填寫禮儀性質、受贈人姓名（必填）、關係、活動日期、地點' },
            { title: '若為多人聯合致贈，勾選「聯合致贈」並填寫聯合人說明' },
            { title: '點選「＋ 新增品項」逐筆填寫送禮明細（品項、廠商、數量、單價）' },
            { title: '確認付款狀態與總金額後儲存' },
          ]} />
        </SubSection>
        <SubSection title="禮儀記錄清單頁">
          <Paragraph>
            可依年份、月份、禮儀類型、狀態、受贈人姓名篩選記錄，清單展開列可查看送禮明細品項。
          </Paragraph>
          <Paragraph>頂部統計卡即時顯示當期：</Paragraph>
          <ul>
            <li>年度總支出 / 已付款金額 / 待付款金額 / 記錄筆數</li>
          </ul>
        </SubSection>
        <SubSection title="狀態說明">
          <ul>
            <li><Tag color="warning">計畫中</Tag>：已記錄但尚未付款</li>
            <li><Tag color="success">已付款</Tag>：款項已結清</li>
            <li><Tag color="default">已取消</Tag>：取消的場合</li>
          </ul>
        </SubSection>
        <SubSection title="禮品類別設定">
          <Paragraph>
            在「類別管理 → 禮品類別」可預設常用品項（如喜餅、花籃、禮金），設定預設單價，新增品項時可快速選用，自動帶入名稱與金額。
          </Paragraph>
        </SubSection>
      </>
    ),
  },

  {
    id: 'groups',
    title: '團體管理',
    icon: <TeamOutlined />,
    color: '#13c2c2',
    category: 'advanced',
    keywords: '團體 group 協會 里長 成員 角色 頭銜',
    summary: '建立協會、里長會等組織，管理成員與互動紀錄',
    content: () => (
      <>
        <Paragraph>
          建立並管理協會、里長會、社區發展委員會等各類團體，追蹤每個團體的成員組成、互動行程、以及在該團體相關場合的禮儀支出。
        </Paragraph>
        <SubSection title="新增團體與成員">
          <StepCard steps={[
            { title: '左側選單「團體管理」→ 點選「＋ 新增團體」' },
            { title: '填寫團體名稱（必填）、類別（宗教/社區/工會/商會等）、電話、地址' },
            { title: '進入團體詳細頁，點選「＋ 新增成員」' },
            { title: '搜尋選民姓名或手機，選取成員後可同時填寫其「角色」與「頭銜」' },
            { title: '成員加入後可點選編輯按鈕修改角色與頭銜' },
          ]} />
        </SubSection>
        <SubSection title="成員角色與頭銜">
          <Paragraph>每位成員在團體中可設定兩個屬性：</Paragraph>
          <ul>
            <li><strong>角色</strong>：在團體內的職務（如主委、幹部、一般成員）</li>
            <li><strong>頭銜</strong>：正式稱謂（如里長、理事長），與選民個人資料中的頭銜欄位分開管理</li>
          </ul>
        </SubSection>
        <SubSection title="行程紀錄串聯">
          <Paragraph>
            在新增行程時，「相關團體」欄位可選擇一或多個相關團體。
            進入團體詳細頁後，「<strong>行程紀錄</strong>」分頁會自動列出所有標記了此團體的行程，呈現完整互動時間軸。
          </Paragraph>
          <Alert message="先在「行程管理」新增行程時選擇相關團體，才會在此頁面的行程紀錄中出現。" type="info" showIcon style={{ marginTop: 8 }} />
        </SubSection>
        <SubSection title="禮儀收支串聯">
          <Paragraph>
            「<strong>禮儀收支</strong>」分頁自動彙總透過串聯行程衍生的所有禮儀支出，讓您一目了然地掌握在特定團體場合的總花費。
          </Paragraph>
          <ul>
            <li>頂部統計卡顯示：成員人數、相關行程筆數、禮儀總支出</li>
            <li>支出明細列出各筆禮儀記錄的日期、受贈人、金額、付款狀態</li>
          </ul>
        </SubSection>
      </>
    ),
  },

  {
    id: 'vendors',
    title: '廠商管理',
    icon: <ShopOutlined />,
    color: '#fa8c16',
    category: 'advanced',
    keywords: '廠商 vendor 花店 印刷 餐飲 對帳',
    summary: '禮儀廠商管理、採購對帳、月統計',
    content: () => (
      <>
        <Paragraph>
          管理禮儀場合常用的花店、禮盒、印刷、餐飲等廠商，追蹤每家廠商的採購金額與付款狀態。
        </Paragraph>
        <SubSection title="新增廠商">
          <StepCard steps={[
            { title: '左側選單「廠商管理」→ 右上角「＋ 新增廠商」' },
            { title: '填寫廠商名稱（必填）、類別（花店/禮盒/印刷/餐飲/其他）' },
            { title: '填寫聯絡人、電話、LINE ID、地址' },
            { title: '填寫銀行帳號（付款用），評分（1-5星），儲存' },
          ]} />
        </SubSection>
        <SubSection title="廠商對帳">
          <Paragraph>點選廠商名稱開啟對帳 Drawer，包含三個分頁：</Paragraph>
          <ul>
            <li><strong>採購明細</strong>：列出所有與該廠商的往來紀錄（日期、類型、受贈人、品項、金額、付款狀態）</li>
            <li><strong>月統計</strong>：本年度各月採購金額彙總</li>
            <li><strong>廠商資訊</strong>：完整基本資料</li>
          </ul>
          <Paragraph>頂部統計卡顯示：總採購次數、總支出、已付款、待付款。</Paragraph>
        </SubSection>
        <SubSection title="停用廠商">
          <Paragraph>
            點選廠商列表中的「狀態」開關可停用（不刪除），停用的廠商不會出現在禮儀記錄新增時的廠商選單中，但歷史記錄保留。
          </Paragraph>
        </SubSection>
      </>
    ),
  },

  {
    id: 'expenses',
    title: '收支統計',
    icon: <DollarOutlined />,
    color: '#52c41a',
    category: 'advanced',
    keywords: '收支 expense 預算 統計 圖表 趨勢',
    summary: '年度/月度收支圖表、預算管理、進度監控',
    content: () => (
      <>
        <Paragraph>
          整合所有禮儀記錄的金額，提供年度/月度多維度統計圖表，以及預算管理功能。
        </Paragraph>
        <SubSection title="篩選方式">
          <Paragraph>頁面右上角可選擇年份與月份，所有統計數據即時更新。</Paragraph>
        </SubSection>
        <SubSection title="四大統計卡">
          <ul>
            <li><strong>年度總支出</strong>：含預算使用進度條（設定預算後顯示）</li>
            <li><strong>已付款金額</strong></li>
            <li><strong>待付款金額</strong></li>
            <li><strong>記錄筆數</strong></li>
          </ul>
        </SubSection>
        <SubSection title="統計圖表（四個分頁）">
          <ul>
            <li><strong>月度趨勢</strong>：長條圖顯示 1–12 月各月支出金額</li>
            <li><strong>類型分析</strong>：圓餅圖 + 明細表，依禮儀性質（婚禮/喪禮等）分析支出占比</li>
            <li><strong>廠商排名</strong>：依採購金額排名前 20 名廠商，含采購次數與占比</li>
            <li><strong>預算管理</strong>：設定年度總預算或月度預算，追蹤預算使用率</li>
          </ul>
        </SubSection>
        <SubSection title="預算設定">
          <StepCard steps={[
            { title: '切換至「預算管理」分頁，點選「設定預算」' },
            { title: '選擇「年度總預算」或「月度預算」（月度需選擇月份）' },
            { title: '輸入預算金額及備註，儲存' },
            { title: '同年同類型預算重複設定時，系統自動更新（不重複新增）' },
          ]} />
          <Alert message="設定年度預算後，「年度總支出」卡片會顯示進度條（超過 70% 顯示橘色，超過 90% 顯示紅色）。" type="info" showIcon style={{ marginTop: 8 }} />
        </SubSection>
      </>
    ),
  },

  {
    id: 'events',
    title: '活動管理',
    icon: <GiftOutlined />,
    color: '#eb2f96',
    category: 'advanced',
    keywords: '活動 event 報名 參與者 容納',
    summary: '建立活動、管理參與名單、與問卷串接',
    content: () => (
      <>
        <Paragraph>
          活動管理用於追蹤辦公室舉辦的各類活動（座談會、服務說明會、里民大會等），可記錄活動基本資訊、管理參與選民名單，並可與問卷調查連結收集回饋。
        </Paragraph>
        <SubSection title="新增活動">
          <StepCard steps={[
            { title: '點擊左側選單「活動管理」' },
            { title: '點擊「新增活動」' },
            { title: '填寫標題（必填）、活動日期（必填）、結束日期、地點、類型、說明、主辦人、容納人數' },
            { title: '儲存後可在活動詳情頁管理參與者名單' },
          ]} />
        </SubSection>
        <SubSection title="活動狀態">
          <ul>
            <li><Tag color="blue">規劃中</Tag> 尚未開始，仍在籌備</li>
            <li><Tag color="orange">進行中</Tag> 活動已開始</li>
            <li><Tag color="green">已完成</Tag> 活動結束</li>
            <li><Tag>已取消</Tag> 活動取消</li>
          </ul>
        </SubSection>
        <SubSection title="參與者管理">
          <Paragraph>
            在活動詳情頁可搜尋並加入選民為參與者，記錄報名狀態（已報名、已出席、未出席）。
            可依活動與問卷連結後，直接從問卷回覆名單中匯入參與者。
          </Paragraph>
        </SubSection>
      </>
    ),
  },

  {
    id: 'surveys',
    title: '問卷調查',
    icon: <FileTextOutlined />,
    color: '#13c2c2',
    category: 'advanced',
    keywords: '問卷 survey 調查 滿意度 統計',
    summary: '建立問卷、收集回覆、結果統計',
    content: () => (
      <>
        <Paragraph>
          問卷調查模組用於建立選民意見調查表、活動滿意度問卷等，支援多種題型，可收集選民回覆並統計結果。
        </Paragraph>
        <SubSection title="建立問卷">
          <StepCard steps={[
            { title: '點擊「問卷調查」→「新增問卷」' },
            { title: '填寫問卷標題與說明' },
            { title: '新增題目：支援單選、多選、簡答、量表等題型' },
            { title: '儲存後問卷進入「草稿」狀態，可隨時修改' },
            { title: '點擊「發布」後問卷開放填答' },
          ]} />
        </SubSection>
        <SubSection title="收集回覆">
          <Paragraph>
            問卷發布後可產生填寫連結，分享給選民填寫；或由辦公室人員代為輸入選民填答內容。
            回覆清單顯示每位填答者的資料，可查看每題作答明細。
          </Paragraph>
        </SubSection>
        <SubSection title="統計結果">
          <Paragraph>
            在問卷詳情頁點擊「統計結果」，可查看各題選項的回覆人數與百分比分布圖表。
          </Paragraph>
        </SubSection>
      </>
    ),
  },

  {
    id: 'notifications',
    title: '通知中心',
    icon: <InfoCircleOutlined />,
    color: '#fa8c16',
    category: 'advanced',
    keywords: '通知 notification 公告 推送',
    summary: '系統內部公告、提醒推送',
    content: () => (
      <>
        <Paragraph>
          通知中心用於建立系統內部公告與提醒，可設定目標對象（全體使用者），提醒辦公室人員注意重要事項。
        </Paragraph>
        <SubSection title="新增通知">
          <StepCard steps={[
            { title: '點擊「通知中心」→「新增通知」' },
            { title: '填寫標題（必填）、通知內容（必填）' },
            { title: '選擇通知頻道（系統內通知）與目標對象（全體）' },
            { title: '儲存為草稿後，點擊「發送」正式推送通知' },
          ]} />
        </SubSection>
        <Alert
          message="通知發送後狀態變為「已送出」，無法撤回。請確認內容無誤後再送出。"
          type="warning" showIcon style={{ marginTop: 8 }}
        />
      </>
    ),
  },

  {
    id: 'reports',
    title: '統計報表',
    icon: <DollarOutlined />,
    color: '#52c41a',
    category: 'advanced',
    keywords: '報表 report 工作量 熱力圖 趨勢 滿意度',
    summary: '工作量、熱力圖、趨勢、滿意度等多維分析',
    content: () => (
      <>
        <Paragraph>
          統計報表提供多維度的業務數據分析，協助掌握陳情趨勢、人員績效與選民互動情況。
        </Paragraph>
        <SubSection title="可用報表">
          <ul>
            <li><strong>負責人工作量</strong>：各人員的負責案件數、結案數、逾期數、平均結案天數</li>
            <li><strong>區域熱力圖</strong>：依行政區統計陳情案件分布，找出高陳情地區</li>
            <li><strong>月度趨勢</strong>：近 12 個月的案件新增 / 結案趨勢折線圖</li>
            <li><strong>類別分布</strong>：各陳情類別的件數與佔比圓餅圖</li>
            <li><strong>滿意度分析</strong>：陳情結案滿意度評分統計</li>
          </ul>
        </SubSection>
        <SubSection title="篩選與匯出">
          <Paragraph>
            各報表可依年份篩選，部分報表支援依狀態、類別進一步過濾。
            點擊右上角「匯出」可下載 Excel 格式的原始數據。
          </Paragraph>
        </SubSection>
      </>
    ),
  },

  {
    id: 'proposals',
    title: '提案追蹤',
    icon: <ProfileOutlined />,
    color: '#722ed1',
    category: 'advanced',
    keywords: '提案 proposal 議會 AI 解析 屆次',
    summary: '議員提案進度管理、AI 智慧匯入、追蹤備註',
    content: () => (
      <>
        <Paragraph>
          提案追蹤模組用於記錄議員提案、市府提案的議會進度，支援 AI 智慧匯入、狀態流程管理與追蹤備註。
        </Paragraph>
        <SubSection title="提案狀態">
          <ul>
            <li><Tag color="blue">待審議</Tag> 提案已送出，等待排程</li>
            <li><Tag color="orange">審議中</Tag> 正在委員會或大會審議</li>
            <li><Tag color="green">通過</Tag> 已通過決議</li>
            <li><Tag color="red">否決</Tag> 未獲通過</li>
            <li><Tag>撤回</Tag> 提案人主動撤回</li>
            <li><Tag>歸檔</Tag> 屆期不連續，存查</li>
          </ul>
        </SubSection>
        <SubSection title="新增提案">
          <StepCard steps={[
            { title: '點擊左側選單「提案追蹤」' },
            { title: '點擊「新增提案」' },
            { title: '填入主旨（必填）、日期、類型、屆次、提案人、內容等欄位' },
            { title: '點擊「儲存」' },
          ]} />
        </SubSection>
        <SubSection title="AI 智慧匯入">
          <Paragraph>已有提案原文（如議會公報文字）時，可用 AI 自動解析所有欄位：</Paragraph>
          <StepCard steps={[
            { title: '點擊表單右上角「AI 匯入」' },
            { title: '貼上提案完整文字（最多 8,000 字）' },
            { title: '點擊「解析」，AI 自動填入編號、日期、提案人、連署人、內容等欄位' },
            { title: '確認結果後點擊「套用」，再手動補充不足欄位' },
          ]} />
          <Alert message="AI 匯入需先在系統設定中完成 AI 助理設定" type="info" showIcon style={{ marginTop: 8 }} />
        </SubSection>
        <SubSection title="其他 AI 功能">
          <ul>
            <li><strong>AI 優化</strong>：在提案詳情頁點擊，摘要提案主要訴求（2–3 句）</li>
            <li><strong>AI 建議</strong>：在追蹤備註欄旁點擊，根據現況建議後續追蹤重點</li>
          </ul>
        </SubSection>
        <SubSection title="篩選與搜尋">
          <Paragraph>
            清單支援關鍵字搜尋（主旨、編號、內容）、狀態、提案類型、屆次、類別、提案人等條件篩選。
            頁面頂端統計列即時顯示各狀態的提案數量。
          </Paragraph>
        </SubSection>
      </>
    ),
  },
]
