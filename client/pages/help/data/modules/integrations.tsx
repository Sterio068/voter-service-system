import React from 'react'
import { Alert, Collapse, Divider, Table, Typography } from 'antd'
import { CalendarOutlined, RobotOutlined } from '@ant-design/icons'
import { SubSection, StepCard } from '../../components/primitives'
import type { HelpModule } from './types'

const { Paragraph, Text } = Typography
const { Panel } = Collapse

export const INTEGRATION_MODULES: HelpModule[] = [
  {
    id: 'ai',
    title: 'AI 助理功能',
    icon: <RobotOutlined />,
    color: '#fa8c16',
    category: 'integrations',
    keywords: 'AI Gemini OpenAI Ollama 摘要 分類 建議',
    summary: 'Gemini / OpenAI / Ollama 三方供應商整合、摘要、分類建議',
    content: () => (
      <>
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
            rowKey={(r) => `${r.module}-${r.func}`}
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
      </>
    ),
  },

  {
    id: 'gcal',
    title: 'Google 日曆整合',
    icon: <CalendarOutlined />,
    color: '#EA4335',
    category: 'integrations',
    keywords: 'Google 日曆 calendar OAuth 同步 token',
    summary: 'OAuth 設定、多帳號同步、Token 管理、常見問題',
    content: () => (
      <>
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
      </>
    ),
  },
]
