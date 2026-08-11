import { expect, test } from '@playwright/test'

const tablesPayload = {
  results: [
    {
      id: 'table-emerald',
      table_code: 'EMERALD-01',
      name: 'Table Émeraude',
      game_type: 'poker',
      stakes: '50 / 100',
      max_players: 6,
      player_count: 2,
      status: 'open',
      is_private: false,
    },
  ],
}

test('navigates from home to the lobby and sees an available table', async ({ page }) => {
  await page.route('**/api/v1/games/tables/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(tablesPayload),
  }))

  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Le jeu a une/i })).toBeVisible()
  await page.getByRole('link', { name: /Entrer dans le lobby/i }).click()

  await expect(page).toHaveURL(/\/lobby$/)
  await expect(page.getByText('Table Émeraude')).toBeVisible()
  await expect(page.locator('.table-main > span')).toHaveText("Poker Texas Hold'em")
})

test('completes the local OTP onboarding journey', async ({ page }) => {
  await page.route('**/api/v1/auth/otp/request/', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ request_id: 'request-1', expires_in: 300, dev_code: '123456' }),
  }))
  await page.route('**/api/v1/auth/otp/verify/', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      access: 'access-token',
      refresh: 'refresh-token',
      user: { id: 'user-1', display_name: 'Miora', phone: '340000000', xp: 0, level: 1 },
      wallet: { balance: 10_000, currency: 'MDG' },
    }),
  }))

  await page.goto('/auth')
  await page.locator('.phone-field input').fill('340000000')
  await page.getByRole('button', { name: /Recevoir mon code/i }).click()
  await expect(page.locator('.auth-code-field')).toBeVisible()
  await page.locator('.auth-code-field').fill('123456')
  await page.locator('.auth-name-field').fill('Miora')
  await page.getByRole('button', { name: /Entrer dans le club/i }).click()

  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByText('Miora')).toBeVisible()
  await expect(page.evaluate(() => localStorage.getItem('mdg_access_token'))).resolves.toBe('access-token')
})

test('switches the core home screen to Malagasy', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Changer de langue' }).click()
  await expect(page.getByRole('heading', { name: /Manana adiresy/i })).toBeVisible()
  await expect(page.getByText('Hiditra amin\'ny lobby')).toBeVisible()
})

test('switches the lobby journey to Malagasy', async ({ page }) => {
  await page.route('**/api/v1/games/tables/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(tablesPayload),
  }))
  await page.goto('/lobby')
  await page.getByRole('button', { name: 'Changer de langue' }).click()
  await expect(page.getByText('Misafidiana latabatra')).toBeVisible()
  await expect(page.getByText('Misokatra', { exact: true })).toBeVisible()
})
