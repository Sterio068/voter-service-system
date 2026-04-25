import React from 'react'
import { Alert, Collapse, Tag, Typography } from 'antd'
import {
  SettingOutlined, InfoCircleOutlined, SafetyOutlined,
  SwapOutlined, MobileOutlined,
} from '@ant-design/icons'
import { SubSection, StepCard } from '../../components/primitives'
import type { HelpModule } from './types'

const { Paragraph, Text } = Typography
const { Panel } = Collapse

export const ADMIN_MODULES: HelpModule[] = [
  {
    id: 'settings',
    title: '系統設定',
    icon: <SettingOutlined />,
    color: '#8E8E93',
    category: 'admin',
    keywords: '設定 settings 機關 port 閒置 類別',
    summary: '機關名稱、系統參數、閒置逾時、類別管理',
    content: () => (
      <>
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
      </>
    ),
  },

  {
    id: 'backup',
    title: '資料備份與還原',
    icon: <SafetyOutlined />,
    color: '#34C759',
    category: 'admin',
    keywords: '備份 backup 還原 restore HMAC 簽章',
    summary: '手動備份、還原、自動排程建議、HMAC 簽章驗證',
    content: () => (
      <>
        <SubSection title="手動備份">
          <StepCard steps={[
            { title: '進入「系統設定」→「資料備份」區塊' },
            { title: '點選「立即備份」，系統自動產生含時間戳記的 .db 備份檔（同時產生 .meta.json 簽章檔）' },
            { title: '備份檔儲存於設定的備份目錄中，建議定期複製到外接硬碟或雲端' },
          ]} />
        </SubSection>
        <SubSection title="還原（含簽章驗證）">
          <StepCard steps={[
            { title: '在備份列表中找到要還原的版本' },
            { title: '點選「還原」，同時上傳 .db 與對應的 .meta.json' },
            { title: '系統會驗證 HMAC 簽章是否相符；不符會拒絕' },
            { title: '驗證通過後系統會先備份目前資料再覆蓋還原，並自動重新整理' },
          ]} />
          <Alert message="無 .meta.json 的舊版備份，需要勾選「強制還原未簽章備份」才會處理。" type="warning" showIcon />
        </SubSection>
        <SubSection title="自動備份建議">
          <Paragraph>
            建議定期手動備份，並將備份目錄設定在外部儲存裝置或雲端同步資料夾（如 iCloud Drive、Google Drive）以防止資料遺失。
          </Paragraph>
        </SubSection>
      </>
    ),
  },

  {
    id: 'handover',
    title: '員工交接',
    icon: <SwapOutlined />,
    color: '#FF9500',
    category: 'admin',
    keywords: '交接 handover 異動 離職 轉移',
    summary: '人員異動時批次轉移陳情、公文、待辦',
    content: () => (
      <>
        <Paragraph>
          「員工交接」功能適用於人員異動時，將某人負責的所有陳情、公文、待辦批次轉移給另一位員工。
        </Paragraph>
        <StepCard steps={[
          { title: '進入「員工交接」頁面（僅管理員可操作）' },
          { title: '選擇「移出人員」（離職或轉調的員工）' },
          { title: '選擇「接手人員」（接收工作的員工）' },
          { title: '確認轉移項目後點選「執行交接」' },
        ]} />
        <Alert message="交接操作會產生操作紀錄，可在「操作紀錄」頁面查看詳情。" type="info" showIcon style={{ marginTop: 12 }} />
      </>
    ),
  },

  {
    id: 'lan',
    title: '區域網路多人使用',
    icon: <InfoCircleOutlined />,
    color: '#5AC8FA',
    category: 'admin',
    keywords: '區網 LAN IP 多人 連線 port',
    summary: '同辦公室多台電腦透過瀏覽器連線同一主機',
    content: () => (
      <>
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
      </>
    ),
  },

  {
    id: 'tailscale',
    title: '外網手機存取（Tailscale）',
    icon: <MobileOutlined />,
    color: '#007AFF',
    category: 'admin',
    keywords: 'Tailscale VPN 手機 外網 行動 QR',
    summary: '免費 P2P VPN，手機隨時連回辦公室主機',
    content: () => (
      <>
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
      </>
    ),
  },
]
