import { expect, type APIRequestContext, type Page } from '@playwright/test'
import type { UserRole } from '../../shared/types'

export type AuthSession = {
  token: string
  password: string
  user: {
    id: number
    username: string
    role: string
    name?: string
  }
}

const API_BASE = 'http://127.0.0.1:8080/api'
const sessionCache = new Map<string, { token: string }>()
const DEFAULT_ADMIN_PASSWORD = 'admin123'
const E2E_ADMIN_PASSWORD = 'Admin12345!'
let currentAdminPassword = DEFAULT_ADMIN_PASSWORD

export async function getSession(
  request: APIRequestContext,
  username: string,
  password: string
): Promise<AuthSession> {
  const cacheKey = `${username}:${password}`
  const cached = sessionCache.get(cacheKey)
  if (cached) {
    const currentUser = await request.get(`${API_BASE}/auth/me`, {
      headers: { authorization: `Bearer ${cached.token}` },
    })

    if (currentUser.ok()) {
      const body = await currentUser.json()
      return { token: cached.token, password, user: body.data }
    }

    sessionCache.delete(cacheKey)
  }

  const login = await request.post(`${API_BASE}/auth/login`, {
    data: { username, password },
  })
  expect(login.ok()).toBeTruthy()
  const body = await login.json()
  const token = body.data.token as string
  sessionCache.set(cacheKey, { token })
  return { token, password, user: body.data.user }
}

export async function getAdminSession(request: APIRequestContext): Promise<AuthSession> {
  if (currentAdminPassword === E2E_ADMIN_PASSWORD) {
    return getSession(request, 'admin', E2E_ADMIN_PASSWORD)
  }

  const defaultSession = await getSession(request, 'admin', currentAdminPassword)
  const changePassword = await request.put(`${API_BASE}/admin/users/1/password`, {
    headers: { authorization: `Bearer ${defaultSession.token}` },
    data: {
      password: E2E_ADMIN_PASSWORD,
      confirm_self_password: currentAdminPassword,
    },
  })
  expect(changePassword.ok()).toBeTruthy()
  currentAdminPassword = E2E_ADMIN_PASSWORD
  sessionCache.clear()
  return getSession(request, 'admin', E2E_ADMIN_PASSWORD)
}

export async function disableFirstRunWizard(request: APIRequestContext, token: string) {
  await request.put(`${API_BASE}/admin/settings`, {
    headers: { authorization: `Bearer ${token}` },
    data: { first_run: 'false' },
  })
}

async function injectSession(page: Page, session: AuthSession) {
  await page.addInitScript(({ token, user }) => {
    window.localStorage.setItem(
      'auth-storage',
      JSON.stringify({
        state: { token, user, isAuthenticated: true },
        version: 0,
      })
    )
  }, session)
}

export async function createUser(
  request: APIRequestContext,
  adminToken: string,
  {
    username,
    password,
    name,
    role,
  }: {
    username: string
    password: string
    name: string
    role: UserRole
  }
) {
  const response = await request.post(`${API_BASE}/admin/users`, {
    headers: { authorization: `Bearer ${adminToken}` },
    data: { username, password, name, role },
  })
  expect(response.ok()).toBeTruthy()
  return { username, password, name, role }
}

export async function createVoterRecord(
  request: APIRequestContext,
  token: string,
  data: { name: string; mobile?: string }
) {
  const response = await request.post(`${API_BASE}/voters`, {
    headers: { authorization: `Bearer ${token}` },
    data,
  })
  expect(response.ok()).toBeTruthy()
  const body = await response.json()
  return body.data as { id: number }
}

export async function createPetitionRecord(
  request: APIRequestContext,
  token: string,
  data: { content: string; petition_date: string; voter_id?: number }
) {
  const response = await request.post(`${API_BASE}/petitions`, {
    headers: { authorization: `Bearer ${token}` },
    data,
  })
  expect(response.ok()).toBeTruthy()
  const body = await response.json()
  return body.data as { id: number }
}

export async function createDocumentRecord(
  request: APIRequestContext,
  token: string,
  data: { subject: string; doc_type?: 'incoming' | 'outgoing'; doc_date?: string }
) {
  const response = await request.post(`${API_BASE}/documents`, {
    headers: { authorization: `Bearer ${token}` },
    data: {
      subject: data.subject,
      doc_type: data.doc_type || 'incoming',
      doc_date: data.doc_date || new Date().toISOString().slice(0, 10),
    },
  })
  expect(response.ok()).toBeTruthy()
  const body = await response.json()
  return body.data as { id: number }
}

export async function createScheduleRecord(
  request: APIRequestContext,
  token: string,
  data: { title: string; schedule_type?: string; start_time: string; end_time: string; location?: string; note?: string }
) {
  const response = await request.post(`${API_BASE}/schedules`, {
    headers: { authorization: `Bearer ${token}` },
    data: {
      title: data.title,
      schedule_type: data.schedule_type || 'meeting',
      start_time: data.start_time,
      end_time: data.end_time,
      location: data.location,
      note: data.note,
      status: 'scheduled',
    },
  })
  expect(response.ok()).toBeTruthy()
  const body = await response.json()
  return body.data as { id: number }
}

export async function createTaskRecord(
  request: APIRequestContext,
  token: string,
  data: { title: string; related_voter_id?: number }
) {
  const response = await request.post(`${API_BASE}/tasks`, {
    headers: { authorization: `Bearer ${token}` },
    data,
  })
  expect(response.ok()).toBeTruthy()
  const body = await response.json()
  return body.data as { id: number }
}

export async function createCeremonyRecord(
  request: APIRequestContext,
  token: string,
  data: { recipient_name: string; ceremony_type?: string; event_date?: string }
) {
  const response = await request.post(`${API_BASE}/ceremonies`, {
    headers: { authorization: `Bearer ${token}` },
    data: {
      ceremony_type: data.ceremony_type || 'other',
      recipient_name: data.recipient_name,
      event_date: data.event_date,
      items: [],
    },
  })
  expect(response.ok()).toBeTruthy()
  const body = await response.json()
  return { id: body.id as number }
}

export async function authenticateAs(
  page: Page,
  request: APIRequestContext,
  username: string,
  password: string
): Promise<AuthSession> {
  const session = await getSession(request, username, password)
  await injectSession(page, session)
  await page.goto('/')
  await expect(page.getByText('Today Command Center')).toBeVisible()
  return session
}

export async function authenticate(page: Page, request: APIRequestContext): Promise<AuthSession> {
  const session = await getAdminSession(request)
  await disableFirstRunWizard(request, session.token)
  await injectSession(page, session)
  await page.goto('/')
  await expect(page.getByRole('button', { name: '新增陳情' })).toBeVisible()
  return session
}
