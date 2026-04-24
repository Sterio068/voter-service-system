import React, { useState } from 'react'
import { Typography, Collapse, Steps, Alert, Tag, Divider, Card, Space, Table } from 'antd'
import {
  CalendarOutlined, TeamOutlined, FileTextOutlined,
  MailOutlined, CheckSquareOutlined, SettingOutlined,
  InfoCircleOutlined, SafetyOutlined, TagsOutlined,
  DashboardOutlined, SwapOutlined, MobileOutlined,
  GiftOutlined, ShopOutlined, DollarOutlined, PrinterOutlined,
  ProfileOutlined, RobotOutlined,
} from '@ant-design/icons'
import PageScaffold from '../components/ui/PageScaffold'
import { buildHelpRoleData } from '../utils/helpAccess'

const { Title, Paragraph, Text, Link } = Typography
const { Panel } = Collapse

// ── 共用 section 元件 ─────────────────────────────────────
function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <Title level={3} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <span style={{ color: '#007AFF' }}>{icon}</span>
        {title}
      </Title>
      {children}
    </div>
  )
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <Title level={4} style={{ marginBottom: 8 }}>{title}</Title>
      {children}
    </div>
  )
}

function StepCard({ steps }: { steps: { title: string; desc?: React.ReactNode }[] }) {
  return (
    <Steps
      direction="vertical"
      size="small"
      current={-1}
      style={{ marginTop: 8 }}
      items={steps.map(s => ({ title: s.title, description: s.desc }))}
    />
  )
}

// ── 快捷鍵表格 ────────────────────────────────────────────
const shortcutData = [
  { key: 'Ctrl + N', desc: '新增陳情案件' },
  { key: 'Ctrl + V', desc: '新增選民資料' },
  { key: 'Ctrl + T', desc: '新增待辦事項' },
  { key: 'Ctrl + Shift + D', desc: '今日待辦事項' },
  { key: 'Ctrl + B', desc: '今日行程' },
  { key: 'Ctrl + K', desc: '全站搜尋' },
  { key: '?', desc: '顯示快捷鍵說明' },
]

// ── 角色權限表格 ──────────────────────────────────────────
const roleData = buildHelpRoleData()

const roleColumns = [
  { title: '模組', dataIndex: 'module', key: 'module', width: 120 },
  { title: '管理員', dataIndex: 'admin', key: 'admin', align: 'center' as const },
  { title: '主管', dataIndex: 'supervisor', key: 'supervisor', align: 'center' as const },
  { title: '助理', dataIndex: 'assistant', key: 'assistant', align: 'center' as const },
  { title: '志工', dataIndex: 'volunteer', key: 'volunteer', align: 'center' as const },
]

// ── 主頁面 ────────────────────────────────────────────────
export default function HelpPage() {
  return (
    <PageScaffold
      eyebrow="Guide Center"
      title="使用說明"
      titleLevel={4}
      variant="compact"
      description="整理角色權限、快捷鍵、主要模組操作與部署維運注意事項。"
    >
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 0 40px' }}>
      <Collapse
        defaultActiveKey={['intro', 'gcal']}
        style={{ background: 'transparent', border: 'none' }}
        expandIconPosition="end"
        size="large"
      >

        {/* ── 系統介紹 ── */}
        <Panel key="intro" header={
          <span style={{ fontWeight: 600, fontSize: 15 }}>
            <DashboardOutlined style={{ marginRight: 8, color: '#007AFF' }} />
            系統介紹與快速入門
          </span>
        } style={{ marginBottom: 8 }}>
          <Paragraph>
            選民服務系統是專為立委/議員服務處設計的整合式管理平台，涵蓋選民資料、陳情案件、公文往來、行程管理、待辦事項等功能，並支援多帳號 Google 日曆同步。
          </Paragraph>

          <SubSection title="系統需求">
            <ul>
              <li>作業系統：macOS 12+（原生應用）或 Windows 10+（原生應用）</li>
              <li>區網連線：其他電腦可透過瀏覽器開啟 <Text code>http://主機IP:8080</Text> 使用</li>
              <li>建議瀏覽器：Chrome、Edge、Safari（區網使用者）</li>
            </ul>
          </SubSection>

          <SubSection title="角色說明">
            <ul>
              <li><Tag color="red">管理員</Tag> 擁有完整業務與管理權限，可操作帳號、稽核、設定、交接與日誌。</li>
              <li><Tag color="orange">主管</Tag> 可處理主要業務、報表與收支，也能查看稽核與系統設定，但不能管理帳號。</li>
              <li><Tag color="blue">助理</Tag> 可新增與編修核心業務資料，能看報表與類別；禮儀、廠商與收支目前以唯讀為主。</li>
              <li><Tag color="default">志工</Tag> 以唯讀為主，可查看選民、陳情、團體、公文、行程、禮儀、待辦與提案資料。</li>
            </ul>
          </SubSection>

          <SubSection title="角色權限總表">
            <Paragraph type="secondary" style={{ marginBottom: 12 }}>
              下表依目前系統的實際 route guard 與模組權限自動整理；若後續角色設定調整，這裡會同步反映。
            </Paragraph>
            <Table
              dataSource={roleData}
              columns={roleColumns}
              pagination={false}
              size="small"
              bordered
              rowKey="module"
            />
          </SubSection>

          <SubSection title="鍵盤快捷鍵">
            <Table
              dataSource={shortcutData}
              columns={[
                { title: '按鍵', dataIndex: 'key', width: 220,
                  render: (k: string) => <kbd style={{ background: '#f5f5f7', border: '1px solid #d1d1d6', borderRadius: 5, padding: '1px 8px', fontFamily: 'monospace', fontSize: 12 }}>{k}</kbd> },
                { title: '功能', dataIndex: 'desc' },
              ]}
              pagination={false}
              size="small"
              rowKey="key"
              showHeader={false}
            />
            <Alert message="在任意頁面按下「?」即可隨時查看快捷鍵清單。" type="info" showIcon style={{ marginTop: 12 }} />
          </SubSection>
        </Panel>

        {/* ── 選民資料 ── */}
        <Panel key="voters" header={
          <span style={{ fontWeight: 600, fontSize: 15 }}>
            <TeamOutlined style={{ marginRight: 8, color: '#34C759' }} />
            選民資料管理
          </span>
        } style={{ marginBottom: 8 }}>
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
              支援從選民列表頁批次匯出 CSV，可用 Excel 開啟並修改後重新匯入。
              匯入格式請參考下載的範本。
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
              透過左側「團體管理」可建立里長協會、社區發展協會等群組，並將選民加入團體並設定其角色與頭銜，方便統計互動紀錄。詳見下方「<strong>團體管理</strong>」章節。
            </Paragraph>
          </SubSection>
        </Panel>

        {/* ── 陳情案件 ── */}
        <Panel key="petitions" header={
          <span style={{ fontWeight: 600, fontSize: 15 }}>
            <FileTextOutlined style={{ marginRight: 8, color: '#FF9500' }} />
            陳情案件管理
          </span>
        } style={{ marginBottom: 8 }}>
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
        </Panel>

        {/* ── 公文管理 ── */}
        <Panel key="documents" header={
          <span style={{ fontWeight: 600, fontSize: 15 }}>
            <MailOutlined style={{ marginRight: 8, color: '#5AC8FA' }} />
            公文管理
          </span>
        } style={{ marginBottom: 8 }}>
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
              點選公文列表右側「Word 圖示」按鈕，即可下載符合政府公文格式的 .doc 檔案。
              格式結構如下：
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
        </Panel>

        {/* ── 行程管理 ── */}
        <Panel key="schedules" header={
          <span style={{ fontWeight: 600, fontSize: 15 }}>
            <CalendarOutlined style={{ marginRight: 8, color: '#AF52DE' }} />
            行程管理
          </span>
        } style={{ marginBottom: 8 }}>
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
              詳細設定步驟請參考下方「<strong>Google 日曆整合設定</strong>」章節。
            </Paragraph>
          </SubSection>
        </Panel>

        {/* ── 禮儀記錄 ── */}
        <Panel key="ceremonies" header={
          <span style={{ fontWeight: 600, fontSize: 15 }}>
            <GiftOutlined style={{ marginRight: 8, color: '#eb2f96' }} />
            禮儀記錄管理
          </span>
        } style={{ marginBottom: 8 }}>
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
            <Paragraph>
              頂部統計卡即時顯示當期：
            </Paragraph>
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
        </Panel>

        {/* ── 團體管理 ── */}
        <Panel key="groups" header={
          <span style={{ fontWeight: 600, fontSize: 15 }}>
            <TeamOutlined style={{ marginRight: 8, color: '#13c2c2' }} />
            團體管理
          </span>
        } style={{ marginBottom: 8 }}>
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
            <Paragraph>
              每位成員在團體中可設定兩個屬性：
            </Paragraph>
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
        </Panel>

        {/* ── 廠商管理 ── */}
        <Panel key="vendors" header={
          <span style={{ fontWeight: 600, fontSize: 15 }}>
            <ShopOutlined style={{ marginRight: 8, color: '#fa8c16' }} />
            廠商管理
          </span>
        } style={{ marginBottom: 8 }}>
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
            <Paragraph>
              點選廠商名稱開啟對帳 Drawer，包含三個分頁：
            </Paragraph>
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
        </Panel>

        {/* ── 收支統計 ── */}
        <Panel key="expenses" header={
          <span style={{ fontWeight: 600, fontSize: 15 }}>
            <DollarOutlined style={{ marginRight: 8, color: '#52c41a' }} />
            收支統計
          </span>
        } style={{ marginBottom: 8 }}>
          <Paragraph>
            整合所有禮儀記錄的金額，提供年度/月度多維度統計圖表，以及預算管理功能。
          </Paragraph>
          <SubSection title="篩選方式">
            <Paragraph>
              頁面右上角可選擇年份與月份，所有統計數據即時更新。
            </Paragraph>
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
        </Panel>

        {/* ── 待辦事項 ── */}
        <Panel key="tasks" header={
          <span style={{ fontWeight: 600, fontSize: 15 }}>
            <CheckSquareOutlined style={{ marginRight: 8, color: '#FF3B30' }} />
            待辦事項
          </span>
        } style={{ marginBottom: 8 }}>
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
        </Panel>

        {/* ── Google 日曆整合 ── */}
        <Panel key="gcal" header={
          <span style={{ fontWeight: 600, fontSize: 15 }}>
            <CalendarOutlined style={{ marginRight: 8, color: '#EA4335' }} />
            Google 日曆整合設定（詳細教學）
          </span>
        } style={{ marginBottom: 8 }}>
          <Alert
            message="需要管理員或主管帳號才能設定 Google 日曆整合。"
            type="info" showIcon style={{ marginBottom: 20 }}
          />

          <SubSection title="第一步：在 Google Cloud Console 建立 OAuth 用戶端">
            <StepCard steps={[
              {
                title: '前往 Google Cloud Console',
                desc: (
                  <Paragraph style={{ marginTop: 4 }}>
                    開啟 <Text code>https://console.cloud.google.com/</Text>，登入您的 Google 帳號。
                  </Paragraph>
                ),
              },
              {
                title: '建立或選擇專案',
                desc: <Paragraph style={{ marginTop: 4 }}>點選頁面左上角的專案選單，選擇現有專案或點選「新增專案」建立一個新專案（例如「選民服務系統」）。</Paragraph>,
              },
              {
                title: '啟用 Google Calendar API',
                desc: (
                  <Paragraph style={{ marginTop: 4 }}>
                    前往「API 與服務 → 程式庫」，搜尋 <Text code>Google Calendar API</Text>，點選後按「啟用」。
                  </Paragraph>
                ),
              },
              {
                title: '設定 OAuth 同意畫面',
                desc: (
                  <div style={{ marginTop: 4 }}>
                    <Paragraph>前往「API 與服務 → OAuth 同意畫面」：</Paragraph>
                    <ul>
                      <li>使用者類型選「外部」（或「內部」若使用 Google Workspace）</li>
                      <li>填寫應用程式名稱（例如「選民服務系統」）、支援電子郵件</li>
                      <li>範圍：點選「新增或移除範圍」，搜尋並勾選 <Text code>https://www.googleapis.com/auth/calendar</Text></li>
                      <li>如為外部應用，需在「測試使用者」中加入要授權的 Gmail 帳號</li>
                      <li>儲存後發布狀態保持「測試」即可</li>
                    </ul>
                  </div>
                ),
              },
              {
                title: '建立 OAuth 2.0 用戶端 ID',
                desc: (
                  <div style={{ marginTop: 4 }}>
                    <Paragraph>前往「API 與服務 → 憑證」→「建立憑證」→「OAuth 用戶端 ID」：</Paragraph>
                    <ul>
                      <li>應用程式類型選：<strong>網路應用程式</strong></li>
                      <li>名稱：任意（例如「選民服務系統 OAuth」）</li>
                      <li>
                        已授權的重新導向 URI，點選「新增 URI」，輸入：
                        <div style={{ background: '#f5f5f7', borderRadius: 6, padding: '6px 12px', margin: '4px 0', fontFamily: 'monospace', fontSize: 13 }}>
                          http://localhost:8080/api/integrations/gcal/callback
                        </div>
                        （若系統使用不同 Port，請將 8080 換成實際 Port）
                      </li>
                      <li>點選「建立」</li>
                    </ul>
                    <Alert message="記下產生的「用戶端 ID」和「用戶端密鑰」，稍後需要填入系統。" type="warning" showIcon style={{ marginTop: 8 }} />
                  </div>
                ),
              },
            ]} />
          </SubSection>

          <Divider />

          <SubSection title="第二步：在系統中填入 OAuth 憑證">
            <StepCard steps={[
              { title: '進入「系統設定」', desc: <Paragraph style={{ marginTop: 4 }}>點選左側導覽列「系統設定」，找到「Google 日曆整合」區塊。</Paragraph> },
              {
                title: '填入 OAuth 憑證',
                desc: (
                  <Paragraph style={{ marginTop: 4 }}>
                    在「Google OAuth 設定」表單中，填入從 Google Cloud Console 取得的：
                    <ul>
                      <li><strong>用戶端 ID</strong>（格式為 <Text code>xxxxxxxxx.apps.googleusercontent.com</Text>）</li>
                      <li><strong>用戶端密鑰</strong></li>
                    </ul>
                    填寫後點選「儲存憑證」。
                  </Paragraph>
                ),
              },
            ]} />
          </SubSection>

          <Divider />

          <SubSection title="第三步：連結 Google 帳號">
            <StepCard steps={[
              {
                title: '點選「新增帳號」',
                desc: <Paragraph style={{ marginTop: 4 }}>在系統設定的 Google 日曆區塊，輸入帳號標籤（例如「主日曆」或「議員行程」），點選「連結 Google 帳號」。</Paragraph>,
              },
              {
                title: 'Google 授權流程',
                desc: (
                  <Paragraph style={{ marginTop: 4 }}>
                    瀏覽器會彈出 Google 登入頁面。選擇要連結的 Google 帳號，授予「管理 Google 日曆行程」的存取權限，點選「允許」。
                  </Paragraph>
                ),
              },
              {
                title: '確認連結成功',
                desc: <Paragraph style={{ marginTop: 4 }}>授權完成後視窗會顯示「✅ Google 日曆已連結成功」，可關閉該視窗。回到系統設定頁，重新整理後可看到帳號已顯示於連結帳號列表中。</Paragraph>,
              },
              {
                title: '（選用）指定同步到特定日曆',
                desc: (
                  <Paragraph style={{ marginTop: 4 }}>
                    預設同步到「primary」（主日曆）。若需同步到特定日曆，點選帳號右側「編輯」，在「Calendar ID」欄位填入目標日曆的 ID。
                    可在 Google 日曆設定頁面「其他日曆 → 設定 → 整合日曆」找到 Calendar ID。
                  </Paragraph>
                ),
              },
            ]} />

            <Alert
              style={{ marginTop: 12 }}
              type="success"
              showIcon
              message="完成後，之後每次新增/修改/刪除行程都會自動同步到所有已啟用的 Google 日曆帳號。"
            />
          </SubSection>

          <Divider />

          <SubSection title="多帳號管理">
            <Paragraph>
              系統支援同時連結多個 Google 帳號（例如議員個人日曆、辦公室共用日曆），每次行程操作都會同步到所有「已啟用」的帳號。
              如需暫停某帳號的同步，點選帳號右側的「停用」開關即可。
            </Paragraph>
          </SubSection>

          <SubSection title="Token 過期處理">
            <Paragraph>
              Google OAuth Token 有效期約 1 小時，系統會自動使用 Refresh Token 更新。若 Refresh Token 也失效（通常因長時間未使用或撤銷授權），
              同步將靜默失敗。此時需前往「系統設定 → Google 日曆」，刪除舊帳號並重新執行連結流程即可。
            </Paragraph>
          </SubSection>

          <SubSection title="常見問題">
            <Collapse ghost size="small">
              <Panel key="q1" header="連結後日曆沒有同步？">
                <ul>
                  <li>確認帳號狀態為「已啟用」（綠色標示）</li>
                  <li>確認 OAuth 同意畫面已加入該 Gmail 為測試使用者</li>
                  <li>刪除帳號後重新授權一次</li>
                </ul>
              </Panel>
              <Panel key="q2" header="授權失敗，顯示『redirect_uri_mismatch』？">
                <Paragraph>
                  Google Cloud Console 中設定的「重新導向 URI」與系統實際 Port 不符。請確認：
                  <br />• 系統設定中的 Port 設定（預設 8080）
                  <br />• Google Cloud Console 中的 URI 為 <Text code>http://localhost:[Port]/api/integrations/gcal/callback</Text>
                </Paragraph>
              </Panel>
              <Panel key="q3" header="如何同步到 Google Workspace（企業版）日曆？">
                <Paragraph>
                  建立 OAuth 用戶端時，「OAuth 同意畫面」的使用者類型選「內部」，並使用 Workspace 帳號授權即可。
                </Paragraph>
              </Panel>
              <Panel key="q4" header="已同步的行程修改後 Google 日曆沒更新？">
                <Paragraph>
                  若 <Text code>gcal_sync_data</Text> 記錄遺失（例如資料庫遷移），系統會嘗試新建行程而非更新。
                  可點選行程詳細頁的「手動同步」按鈕強制重新同步。
                </Paragraph>
              </Panel>
            </Collapse>
          </SubSection>
        </Panel>

        {/* ── 活動管理 ── */}
        <Panel key="events" header={
          <span style={{ fontWeight: 600, fontSize: 15 }}>
            <GiftOutlined style={{ marginRight: 8, color: '#eb2f96' }} />
            活動管理
          </span>
        } style={{ marginBottom: 8 }}>
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
        </Panel>

        {/* ── 問卷調查 ── */}
        <Panel key="surveys" header={
          <span style={{ fontWeight: 600, fontSize: 15 }}>
            <FileTextOutlined style={{ marginRight: 8, color: '#13c2c2' }} />
            問卷調查
          </span>
        } style={{ marginBottom: 8 }}>
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
        </Panel>

        {/* ── 通知中心 ── */}
        <Panel key="notifications" header={
          <span style={{ fontWeight: 600, fontSize: 15 }}>
            <InfoCircleOutlined style={{ marginRight: 8, color: '#fa8c16' }} />
            通知中心
          </span>
        } style={{ marginBottom: 8 }}>
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
        </Panel>

        {/* ── 統計報表 ── */}
        <Panel key="reports" header={
          <span style={{ fontWeight: 600, fontSize: 15 }}>
            <DollarOutlined style={{ marginRight: 8, color: '#52c41a' }} />
            統計報表
          </span>
        } style={{ marginBottom: 8 }}>
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
        </Panel>

        {/* ── 提案追蹤 ── */}
        <Panel key="proposals" header={
          <span style={{ fontWeight: 600, fontSize: 15 }}>
            <ProfileOutlined style={{ marginRight: 8, color: '#722ed1' }} />
            提案追蹤
          </span>
        } style={{ marginBottom: 8 }}>
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
        </Panel>

        {/* ── AI 助理 ── */}
        <Panel key="ai" header={
          <span style={{ fontWeight: 600, fontSize: 15 }}>
            <RobotOutlined style={{ marginRight: 8, color: '#fa8c16' }} />
            AI 助理功能
          </span>
        } style={{ marginBottom: 8 }}>
          <Paragraph>
            AI 助理整合 Google Gemini、OpenAI 及本地 Ollama，提供陳情摘要、自動分類、備註建議與提案解析等功能。
            需由管理員在「系統設定 → AI 助理設定」完成設定後才能使用。
          </Paragraph>
          <SubSection title="各模組功能一覽">
            <Table
              size="small"
              pagination={false}
              dataSource={[
                { module: '陳情案件', func: 'AI 摘要', desc: '摘要陳情內容重點（2–3 句）' },
                { module: '陳情案件', func: 'AI 分類建議', desc: '依主旨與內容推薦最適類別' },
                { module: '陳情案件', func: 'AI 備註建議', desc: '建議後續處理方向與聯絡要點' },
                { module: '公文管理', func: 'AI 摘要', desc: '摘要公文主旨與說明事項' },
                { module: '提案追蹤', func: 'AI 匯入解析', desc: '將提案原文解析為結構化欄位' },
                { module: '提案追蹤', func: 'AI 優化摘要', desc: '摘要提案主要訴求與目的' },
                { module: '提案追蹤', func: 'AI 備註建議', desc: '建議後續應注意事項或跟進方向' },
              ]}
              columns={[
                { title: '模組', dataIndex: 'module', key: 'module', width: 110 },
                { title: '功能', dataIndex: 'func', key: 'func', width: 140 },
                { title: '說明', dataIndex: 'desc', key: 'desc' },
              ]}
            />
          </SubSection>
          <SubSection title="供應商設定步驟">
            <StepCard steps={[
              { title: '前往「系統設定」→「AI 助理設定」（需管理員權限）' },
              { title: '選擇供應商：Google Gemini / OpenAI / Ollama（本地）' },
              { title: '填入 API 金鑰（Gemini 或 OpenAI）；Ollama 填入端點，預設 http://localhost:11434' },
              { title: '選擇模型名稱，推薦 Gemini 使用 gemini-2.5-flash，OpenAI 使用 gpt-4o-mini' },
              { title: '點擊「儲存 AI 設定」，再點擊「測試連線」確認正常' },
            ]} />
          </SubSection>
          <SubSection title="供應商比較">
            <ul>
              <li><strong>Google Gemini</strong>：效果佳、速度快，有免費額度，一般辦公室首選（需網路）</li>
              <li><strong>OpenAI</strong>：業界標準，高精度，需付費 API（需網路）</li>
              <li><strong>Ollama（本地）</strong>：完全離線，資料不外傳，需主機有足夠 GPU / RAM</li>
            </ul>
          </SubSection>
          <Alert
            message="Gemini 免費額度"
            description="前往 aistudio.google.com 可免費申請 Gemini API 金鑰，每日有免費呼叫次數，適合小型辦公室使用。"
            type="success"
            showIcon
            style={{ marginTop: 8 }}
          />
          <Alert
            message="注意事項"
            description="AI 回應為輔助建議，請人工確認後再採用。API 金鑰儲存於本機，設定頁僅顯示末 4 碼遮罩。"
            type="warning"
            showIcon
            style={{ marginTop: 8 }}
          />
        </Panel>

        {/* ── 系統設定 ── */}
        <Panel key="settings" header={
          <span style={{ fontWeight: 600, fontSize: 15 }}>
            <SettingOutlined style={{ marginRight: 8, color: '#8E8E93' }} />
            系統設定
          </span>
        } style={{ marginBottom: 8 }}>
          <SubSection title="基本設定">
            <ul>
              <li><strong>機關名稱</strong>：顯示於系統標題、公文匯出</li>
              <li><strong>系統 Port</strong>：修改後需重新啟動系統才生效；同時更新 Google OAuth 重導向 URI</li>
              <li><strong>閒置逾時</strong>：超過指定分鐘無操作自動登出（最短 5 分鐘）</li>
            </ul>
          </SubSection>
          <SubSection title="備份路徑設定">
            <Paragraph>
              預設備份目錄為系統資料夾下的 <Text code>backups/</Text>。
              點選「變更目錄」可選擇其他資料夾（如外接硬碟或網路磁碟）作為備份目的地。
            </Paragraph>
            <Alert message="此功能僅在桌面版（Electron）可使用資料夾選擇對話框；區網瀏覽器版需手動輸入路徑。" type="info" showIcon />
          </SubSection>
          <SubSection title="類別管理">
            <Paragraph>
              在「類別管理」頁面可建立各模組使用的分類標籤，共六個分頁：
            </Paragraph>
            <ul>
              <li>
                <Tag color="blue">行程類型</Tag>（首頁）— 新增自訂類型，可設定名稱與行事曆顏色；系統內建 10 種，公祭為保護類型無法刪除
              </li>
              <li><Tag>陳情類別</Tag> 例如：道路修繕、水電問題、社福申請</li>
              <li><Tag>陳情區域</Tag> 例如：第一選區、某里</li>
              <li><Tag>選民標籤</Tag> 例如：樁腳、志工、捐款者</li>
              <li><Tag>團體類別</Tag> 例如：宗教團體、社區發展協會、商會</li>
              <li><Tag>公文分類</Tag> 例如：一般事項、陳情轉介、行政聯繫</li>
              <li><Tag color="pink">禮品類別</Tag> 禮儀常用品項，可設定單位與預設單價，新增送禮明細時快速帶入</li>
            </ul>
          </SubSection>
        </Panel>

        {/* ── 備份與還原 ── */}
        <Panel key="backup" header={
          <span style={{ fontWeight: 600, fontSize: 15 }}>
            <SafetyOutlined style={{ marginRight: 8, color: '#34C759' }} />
            資料備份與還原
          </span>
        } style={{ marginBottom: 8 }}>
          <SubSection title="手動備份">
            <StepCard steps={[
              { title: '進入「系統設定」→「資料備份」區塊' },
              { title: '點選「立即備份」，系統自動產生含時間戳記的 .db 備份檔' },
              { title: '備份檔儲存於設定的備份目錄中' },
            ]} />
          </SubSection>
          <SubSection title="還原">
            <StepCard steps={[
              { title: '在備份列表中找到要還原的版本' },
              { title: '點選「還原」，系統會先備份目前資料後再覆蓋' },
              { title: '還原完成後系統自動重新整理' },
            ]} />
            <Alert message="還原操作不可逆，系統會自動保留一份當前資料備份，但請謹慎操作。" type="warning" showIcon />
          </SubSection>
          <SubSection title="自動備份建議">
            <Paragraph>
              建議定期手動備份，並將備份目錄設定在外部儲存裝置或雲端同步資料夾（如 iCloud Drive、Google Drive）以防止資料遺失。
            </Paragraph>
          </SubSection>
        </Panel>

        {/* ── 聯絡記錄 ── */}
        <Panel key="contactRecords" header={
          <span style={{ fontWeight: 600, fontSize: 15 }}>
            <TeamOutlined style={{ marginRight: 8, color: '#1677ff' }} />
            聯絡記錄
          </span>
        } style={{ marginBottom: 8 }}>
          <Paragraph>
            聯絡記錄用於記錄辦公室與選民的每次互動（電話、面訪、LINE 等），幫助掌握選民關係並追蹤重要事項的跟進情況。
          </Paragraph>
          <SubSection title="新增聯絡記錄">
            <Paragraph>
              有兩種方式新增：
            </Paragraph>
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
        </Panel>

        {/* ── 員工交接 ── */}
        <Panel key="handover" header={
          <span style={{ fontWeight: 600, fontSize: 15 }}>
            <SwapOutlined style={{ marginRight: 8, color: '#FF9500' }} />
            員工交接
          </span>
        } style={{ marginBottom: 8 }}>
          <Paragraph>
            「員工交接」功能適用於人員異動時，將某人負責的所有陳情、公文、待辦批次轉移給另一位員工。
          </Paragraph>
          <StepCard steps={[
            { title: '進入「員工交接」頁面（需主管以上權限）' },
            { title: '選擇「移出人員」（離職或轉調的員工）' },
            { title: '選擇「接手人員」（接收工作的員工）' },
            { title: '確認轉移項目後點選「執行交接」' },
          ]} />
          <Alert message="交接操作會產生操作紀錄，可在「操作紀錄」頁面查看詳情。" type="info" showIcon style={{ marginTop: 12 }} />
        </Panel>

        {/* ── 區網使用 ── */}
        <Panel key="lan" header={
          <span style={{ fontWeight: 600, fontSize: 15 }}>
            <InfoCircleOutlined style={{ marginRight: 8, color: '#5AC8FA' }} />
            區域網路多人使用
          </span>
        } style={{ marginBottom: 8 }}>
          <SubSection title="連線方式">
            <Paragraph>
              主機（安裝本軟體的電腦）啟動後，同一區網的其他電腦可透過瀏覽器開啟：
            </Paragraph>
            <div style={{ background: '#f5f5f7', borderRadius: 8, padding: '10px 16px', fontFamily: 'monospace', fontSize: 14, marginBottom: 12 }}>
              http://主機IP位址:8080
            </div>
            <Paragraph>
              主機 IP 可在「系統設定」頁面查看，或在主機電腦的終端機輸入 <Text code>ifconfig</Text>（Mac）/ <Text code>ipconfig</Text>（Windows）查詢。
            </Paragraph>
          </SubSection>
          <SubSection title="注意事項">
            <ul>
              <li>主機必須保持開機狀態，其他電腦才能連線</li>
              <li>每位使用者需有獨立帳號，不建議共用帳號</li>
              <li>區網版不支援 HTTPS，請在信任的內部網路使用</li>
              <li>若防火牆封鎖連線，需在主機開放 TCP Port 8080</li>
            </ul>
          </SubSection>
        </Panel>

        {/* ── 外網手機存取 ── */}
        <Panel key="tailscale" header={
          <span style={{ fontWeight: 600, fontSize: 15 }}>
            <MobileOutlined style={{ marginRight: 8, color: '#007AFF' }} />
            外網手機存取（Tailscale VPN）
          </span>
        } style={{ marginBottom: 8 }}>
          <Paragraph>
            Tailscale 是免費的 P2P VPN 工具，讓手機透過加密隧道安全連回辦公室主機，不需要固定 IP 或開放防火牆。
          </Paragraph>
          <Alert
            type="info" showIcon style={{ marginBottom: 16 }}
            message="個人免費版支援最多 3 台裝置同時連線（例如：辦公室主機 + 議員手機 + 助理手機），完全免費、無流量限制。"
          />

          <SubSection title="安裝步驟（一次性設定，約 5 分鐘）">
            <StepCard steps={[
              {
                title: '主機安裝 Tailscale',
                desc: (
                  <Paragraph style={{ marginTop: 4 }}>
                    前往 <Text code>https://tailscale.com/download</Text> 下載對應版本（macOS 或 Windows），安裝後點選登入。
                    若尚無帳號，可用 Google / GitHub / Microsoft 帳號直接登入。
                  </Paragraph>
                ),
              },
              {
                title: '確認主機已取得 Tailscale IP',
                desc: (
                  <Paragraph style={{ marginTop: 4 }}>
                    安裝完成後，Tailscale 會分配一個 <strong>100.x.x.x</strong> 格式的私有 IP。
                    可在「系統設定 → 外網手機存取」頁面點選「偵測」確認 IP，同時自動顯示連線 QR Code。
                  </Paragraph>
                ),
              },
              {
                title: '手機安裝 Tailscale App',
                desc: (
                  <Paragraph style={{ marginTop: 4 }}>
                    <strong>iOS</strong>：App Store 搜尋「Tailscale」安裝<br />
                    <strong>Android</strong>：Google Play 搜尋「Tailscale」安裝<br />
                    App 安裝後，登入<strong>與主機相同的 Tailscale 帳號</strong>。
                  </Paragraph>
                ),
              },
              {
                title: '手機連線系統',
                desc: (
                  <Paragraph style={{ marginTop: 4 }}>
                    手機確認 Tailscale App 已連線後，開啟瀏覽器輸入：
                    <div style={{ background: '#f5f5f7', borderRadius: 6, padding: '6px 12px', margin: '6px 0', fontFamily: 'monospace', fontSize: 13 }}>
                      http://主機Tailscale-IP:8080
                    </div>
                    或直接掃描「系統設定 → 外網手機存取」中顯示的 QR Code。
                  </Paragraph>
                ),
              },
            ]} />
          </SubSection>

          <SubSection title="使用注意事項">
            <ul>
              <li>主機的 Tailscale 必須保持連線中（可設定開機自動啟動）</li>
              <li>手機使用時 Tailscale App 必須在背景執行</li>
              <li>Tailscale 連線是端對端加密，安全性高於一般 VPN</li>
              <li>手機和主機不需在同一 Wi-Fi，4G / 5G 均可使用</li>
              <li>多人使用可申請免費 Tailscale 組織帳號（3 人以下免費）</li>
            </ul>
          </SubSection>

          <SubSection title="常見問題">
            <Collapse ghost size="small">
              <Panel key="ts1" header="手機掃描 QR Code 後無法連線？">
                <ul>
                  <li>確認手機 Tailscale App 已啟動且顯示「Connected」</li>
                  <li>確認手機與主機登入的是<strong>同一個</strong> Tailscale 帳號</li>
                  <li>確認主機 Tailscale 顯示「Connected」而非「Disconnected」</li>
                  <li>嘗試在手機瀏覽器直接輸入 <Text code>http://100.x.x.x:8080</Text></li>
                </ul>
              </Panel>
              <Panel key="ts2" header="系統設定偵測不到 Tailscale IP？">
                <Paragraph>
                  確認主機已安裝並連線 Tailscale。若仍偵測不到：<br />
                  • macOS：確認 <Text code>/usr/local/bin/tailscale</Text> 或 <Text code>/Applications/Tailscale.app</Text> 存在<br />
                  • Windows：確認 Tailscale 已加入系統 PATH，或重新安裝
                </Paragraph>
              </Panel>
              <Panel key="ts3" header="如何讓 Tailscale 開機自動連線？">
                <Paragraph>
                  macOS 與 Windows 版安裝後均預設開機自動啟動，無需額外設定。
                  可在系統選單列（Mac）或工作列（Windows）確認 Tailscale 圖示是否顯示「Connected」。
                </Paragraph>
              </Panel>
            </Collapse>
          </SubSection>
        </Panel>

      </Collapse>
    </div>
    </PageScaffold>
  )
}
