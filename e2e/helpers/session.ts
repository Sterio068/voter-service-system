import { expect, type APIRequestContext, type Page } from '@playwright/test'
import type { UserRole } from '../../shared/types'

export type AuthSession = {
  token: string
  user: {
    id: number
    username: string
    role: string
    name?: string
  }
}

const API_BASE = 'http://127.0.0.1:8080/api'
const sessionCache = new Map<string, { token: string }>()

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
      return { token: cached.token, user: body.data }
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
  return { token, user: body.data.user }
}

export async function getAdminSession(request: APIRequestContext): Promise<AuthSession> {
  return getSession(request, 'admin', 'admin123')
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
