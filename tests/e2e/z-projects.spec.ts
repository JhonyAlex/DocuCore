import { expect, test } from './fixtures'

test.describe('PROJ-01 proyectos', () => {
  test('shows the project plan limit before opening the creation form', async ({ page, consoleIssues }) => {
    await page.route('**/api/billing/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          workspaceId: 1,
          name: 'Workspace Starter',
          slug: 'workspace-starter',
          billingStatus: 'ACTIVE',
          billingSource: 'MANUAL',
          planKey: 'STARTER',
          planName: 'Starter',
          maxActiveProjects: 1,
          activeProjectsCount: 1,
          archivedProjectsCount: 0,
          maxActiveMembers: 3,
          activeMembersCount: 1,
          planLockedMembersCount: 0,
          suspendedMembersCount: 0,
          planLockedProjectsCount: 0,
          remainingMemberSeats: 2,
          projectsCompliant: true,
          membersCompliant: true,
          complianceStatus: 'COMPLIANT',
          canCreateProject: false,
          canDowngradeToStarter: true,
          canInviteMember: true,
          canActivateMember: true,
          trialStartedAt: null,
          trialEndsAt: null,
          trialDaysLeft: 0,
          isEntitledToWrite: true,
          entitlementReason: null,
          hasSubscription: true,
          currentPeriodEnd: null,
          graceEndsAt: null,
          cancelAtPeriodEnd: false,
          role: 'OWNER',
          isOwner: true,
        }),
      })
    })
    await page.goto('/projects')
    await page.getByRole('button', { name: 'Nuevo proyecto', exact: true }).click()
    await expect(page.getByRole('alert')).toHaveText('Has alcanzado el límite de proyectos activos de tu plan. Archiva uno o actualiza tu plan.')
    await expect(page.getByRole('dialog', { name: 'Nuevo proyecto' })).toHaveCount(0)
    expect(consoleIssues).toEqual([])
  })

  test('creates, opens, archives and restores a project from the portfolio', async ({ page, consoleIssues }) => {
    const stamp = Date.now()
    const code = `e2e-proj-${stamp}`
    const name = `Proyecto aislado ${stamp}`
    await page.goto('/projects')

    await page.getByRole('button', { name: 'Nuevo proyecto', exact: true }).click()
    await page.getByLabel('Código').fill(`E2E PROJ ${stamp}`)
    await expect(page.getByLabel('Código')).toHaveValue(code)
    await page.getByLabel('Nombre').fill(name)
    await page.getByLabel('Descripción').fill('Creado desde el flujo de cartera multi-proyecto')
    const created = page.waitForResponse((response) => response.url().endsWith('/api/projects') && response.request().method() === 'POST')
    await page.getByRole('button', { name: 'Crear proyecto' }).click()
    expect((await created).status()).toBe(201)

    const card = page.locator('[role="button"]').filter({ hasText: code })
    await expect(card).toBeVisible()
    let projectLoads = 0
    page.on('request', (request) => {
      if (request.method() === 'GET' && /\/api\/projects\/\d+$/.test(new URL(request.url()).pathname)) projectLoads += 1
    })
    await card.click()
    await expect(page).toHaveURL(/\/projects\/\d+\/dashboard$/)
    await expect(page.locator('aside')).toContainText(name)
    await page.waitForTimeout(150)
    expect(projectLoads).toBeGreaterThanOrEqual(1)
    expect(projectLoads).toBeLessThanOrEqual(2)

    await page.goto('/projects')
    await card.hover()
    await card.getByRole('button', { name: 'Archivar' }).click()
    await page.getByRole('button', { name: 'Archivar' }).last().click()
    await expect(card).toContainText('Archivo')
    await card.hover()
    await card.getByRole('button', { name: 'Reactivar' }).click()
    await page.getByRole('button', { name: 'Reactivar' }).last().click()
    await expect(card).toContainText('Activo')
    expect(consoleIssues).toEqual([])
  })
})
