import { expect, test, type Page } from '@playwright/test'

const table = {
  id: 'table-emerald',
  table_code: 'EMERALD-01',
  name: 'Table Émeraude',
  game_type: 'poker' as const,
  stakes: '50 / 100',
  max_players: 6,
  player_count: 2,
  status: 'running' as const,
  is_private: false,
}

const tablesPayload = { results: [table] }

async function stubGameApis(page: Page) {
  await page.addInitScript(() => {
    const messages: string[] = []
    class MockWebSocket {
      static OPEN = 1
      static instances: MockWebSocket[] = []
      onopen: (() => void) | null = null
      onclose: (() => void) | null = null
      onerror: (() => void) | null = null
      onmessage: ((event: MessageEvent<string>) => void) | null = null
      readyState = 0

      constructor(public url: string) {
        MockWebSocket.instances.push(this)
        window.setTimeout(() => {
          this.readyState = 1
          this.onopen?.()
        }, 0)
      }

      send(message: string) {
        messages.push(message)
      }

      close() {
        this.readyState = 3
        this.onclose?.()
      }
    }
    Object.assign(window, { __wsMessages: messages, __wsInstances: MockWebSocket.instances })
    Object.assign(window, { WebSocket: MockWebSocket })
  })
  await page.addInitScript(() => {
    localStorage.setItem('mdg_access_token', 'e2e-token')
    localStorage.setItem('mdg_refresh_token', 'e2e-refresh')
  })
  await page.route('**/api/v1/games/tables/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(tablesPayload),
  }))
  await page.route('**/api/v1/games/tables/table-emerald/join/', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ table, created: false }),
  }))
  await page.route('**/api/v1/social/tables/**/chat/', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ results: [] }),
  }))
}

test('expose spectator and demo AI journeys from the lobby', async ({ page }) => {
  await stubGameApis(page)
  await page.goto('/lobby')

  await expect(page.getByRole('link', { name: /Regarder/i })).toHaveAttribute('href', /mode=spectator/)
  await expect(page.getByRole('link', { name: /Jeux test/i }).last()).toHaveAttribute('href', /mode=demo_ai/)

  await page.getByRole('link', { name: /Regarder/i }).click()
  await expect(page).toHaveURL(/mode=spectator/)
  await expect(page.getByText('Mode spectateur')).toBeVisible()
  await expect(page.getByText(/lecture seule/i).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /Se coucher|Vérifier|Miser/i })).toHaveCount(0)
})

test('joins a table, sends leave, and returns to the lobby', async ({ page }) => {
  await stubGameApis(page)
  await page.goto('/game/poker/EMERALD-01')
  await expect(page.getByText(/Connecté/)).toBeVisible()

  await page.getByRole('link', { name: /Quitter la table/i }).click()
  await expect(page).toHaveURL(/\/lobby$/)

  const messages = await page.evaluate(() => (window as Window & { __wsMessages: string[] }).__wsMessages.map(JSON.parse))
  expect(messages.some((message) => message.type === 'join')).toBeTruthy()
  expect(messages.find((message) => message.type === 'leave')).toMatchObject({ type: 'leave', table_id: 'table-emerald' })
})

test('reconnects the table socket after a transient disconnect', async ({ page }) => {
  await stubGameApis(page)
  await page.goto('/game/poker/EMERALD-01')
  await expect(page.getByText(/Connecté/)).toBeVisible()

  await page.evaluate(() => {
    const instances = (window as Window & { __wsInstances: Array<{ close: () => void }> }).__wsInstances
    instances[0]?.close()
  })
  await expect.poll(() => page.evaluate(() => (window as Window & { __wsInstances: unknown[] }).__wsInstances.length), { timeout: 12_000 }).toBeGreaterThan(1)
  await expect(page.getByText(/Connecté/)).toBeVisible()

  const messages = await page.evaluate(() => (window as Window & { __wsMessages: string[] }).__wsMessages.map(JSON.parse))
  expect(messages.filter((message) => message.type === 'join').length).toBeGreaterThanOrEqual(2)
})
