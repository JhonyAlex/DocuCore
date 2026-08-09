import { readdir, mkdir, writeFile, rm } from 'node:fs/promises'
import path from 'node:path'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { runDbScript } from '../helpers/dbScripts'

type LocationRow = { id: number; name: string; code: string; parentId: number | null }

const e2eEnv = {
  DATABASE_URL: process.env.DATABASE_URL ?? `postgresql://docucore:docucore@127.0.0.1:${process.env.DOCUCORE_DB_PORT ?? '5436'}/docucore?schema=public`,
  DOCUMENT_STORAGE_PATH: `${process.cwd()}/test-results/e2e-documents`,
}

async function createLocation(page: Page, data: { name: string; code: string; parentId?: number | null; projectId?: number; responsibleId?: number }): Promise<{ status: number; body: LocationRow & { message?: string } }> {
  const usersResponse = await page.request.get('/api/users')
  const users = await usersResponse.json() as Array<{ id: number }>
  const response = await page.request.post('/api/locations', {
    data: {
      name: data.name,
      code: data.code,
      surface: '100 m²',
      parentId: data.parentId ?? null,
      responsibleId: data.responsibleId ?? users[0].id,
      projectId: data.projectId ?? 1,
    },
  })
  return { status: response.status(), body: await response.json() as LocationRow & { message?: string } }
}

async function locations(page: Page): Promise<LocationRow[]> {
  const response = await page.request.get('/api/locations')
  const body = await response.json() as { locations: LocationRow[] }
  return body.locations
}

async function goToLocations(page: Page): Promise<void> {
  await page.goto('/locations')
  await expect(page.getByRole('heading', { name: 'Ubicaciones', exact: true })).toBeVisible()
}

test.describe('Locations lifecycle', () => {
  test.describe.configure({ mode: 'serial' })

  test('reset leaves zero assets, documents, locations and empty storage', async ({ page }) => {
    await runDbScript('db:reset:manual-test', e2eEnv)

    // El marcador propio puede permanecer; ningún fichero de documento debe quedar.
    const storageFiles = await readdir(e2eEnv.DOCUMENT_STORAGE_PATH).catch(() => [])
    expect(storageFiles.filter((file) => !file.startsWith('.docucore'))).toEqual([])

    const [assetsRes, docsRes, locsRes] = await Promise.all([
      page.request.get('/api/assets'),
      page.request.get('/api/documents'),
      page.request.get('/api/locations'),
    ])
    expect((await assetsRes.json() as { total: number }).total).toBe(0)
    expect((await docsRes.json() as { total: number }).total).toBe(0)
    expect((await locsRes.json() as { locations: unknown[] }).locations.length).toBe(0)
  })

  test('reset fails with an error when the storage cannot be safely cleaned', async ({ page }) => {
    // Un marcador corrupto debe hacer que la limpieza segura falle y que el
    // script termine con error, aunque el reset de BD ya se haya completado
    // (reset parcial: nunca se silencia una limpieza no garantizada).
    const corruptDir = path.join(process.cwd(), 'test-results', 'corrupt-storage')
    await rm(corruptDir, { recursive: true, force: true })
    await mkdir(corruptDir, { recursive: true })
    await writeFile(path.join(corruptDir, '.docucore-storage.json'), '{marcador corrupto', 'utf8')
    await writeFile(path.join(corruptDir, 'f81f42c8-0000-4000-8000-000000000000.pdf'), 'contenido', 'utf8')

    try {
      const result = await runDbScript('db:reset:manual-test', { ...e2eEnv, DOCUMENT_STORAGE_PATH: corruptDir })
      expect(result.code).not.toBe(0)

      // El reset de BD sí se completó (parcial) y el storage quedó intacto.
      const assetsRes = await page.request.get('/api/assets')
      expect((await assetsRes.json() as { total: number }).total).toBe(0)
      expect((await readdir(corruptDir))).toContain('f81f42c8-0000-4000-8000-000000000000.pdf')
    } finally {
      await rm(corruptDir, { recursive: true, force: true })
    }
  })

  test('reset fails when a managed file cannot be removed (rm error reaches the script)', async ({ page }) => {
    // Marcador válido y una "clave gestionada" que no puede eliminarse: un
    // directorio con ese nombre y contenido dentro. `rm` sin recursive falla
    // con ENOTEMPTY de forma determinista en Windows y POSIX, y el script debe
    // terminar con error en vez de silenciar la limpieza.
    const blockedDir = path.join(process.cwd(), 'test-results', 'blocked-rm-storage')
    await rm(blockedDir, { recursive: true, force: true })
    await mkdir(blockedDir, { recursive: true })
    await writeFile(path.join(blockedDir, '.docucore-storage.json'), JSON.stringify({ owner: 'docucore-document-storage', createdAt: new Date().toISOString() }), 'utf8')
    const managedName = 'f81f42c8-0000-4000-8000-000000000000.pdf'
    const managedEntry = path.join(blockedDir, managedName)
    await mkdir(managedEntry, { recursive: true })
    await writeFile(path.join(managedEntry, 'contenido-interno.txt'), 'no vacío', 'utf8')

    try {
      const result = await runDbScript('db:reset:manual-test', { ...e2eEnv, DOCUMENT_STORAGE_PATH: blockedDir })
      expect(result.code).not.toBe(0)

      // Reset parcial: la BD quedó vacía pero la entrada gestionada sigue ahí.
      const assetsRes = await page.request.get('/api/assets')
      expect((await assetsRes.json() as { total: number }).total).toBe(0)
      expect((await readdir(blockedDir))).toContain(managedName)
    } finally {
      await rm(blockedDir, { recursive: true, force: true })
    }
  })

  test('creates root, child and grandchild', async ({ page }) => {
    const root = await createLocation(page, { name: 'Raíz E2E', code: 'R-E2E' })
    expect(root.status).toBe(201)
    const child = await createLocation(page, { name: 'Hijo E2E', code: 'H-E2E', parentId: root.body.id })
    expect(child.status).toBe(201)
    const grandchild = await createLocation(page, { name: 'Nieto E2E', code: 'N-E2E', parentId: child.body.id })
    expect(grandchild.status).toBe(201)

    const tree = await locations(page)
    const byId = new Map(tree.map((l) => [l.id, l]))
    expect(byId.get(child.body.id)?.parentId).toBe(root.body.id)
    expect(byId.get(grandchild.body.id)?.parentId).toBe(child.body.id)
  })

  test('selects and edits a parent location after adding children', async ({ page }) => {
    await goToLocations(page)
    await page.locator('summary', { hasText: 'Raíz E2E' }).click()
    await expect(page.getByRole('heading', { name: 'Raíz E2E', exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Editar', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Editar ubicación' })
    await expect(dialog).toBeVisible()
    await dialog.locator('#location-surface').fill('250 m²')
    const updateResponse = page.waitForResponse((r) => r.request().method() === 'PUT' && r.url().includes('/api/locations/'))
    await dialog.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
    expect((await updateResponse).status()).toBe(200)
    await expect(dialog).toHaveCount(0)
    await expect(page.getByText('250 m²', { exact: true })).toBeVisible()
  })

  test('rejects cycles and cross-project relations with real memberships', async ({ page }) => {
    const tree = await locations(page)
    const root = tree.find((l) => l.code === 'R-E2E')!
    const child = tree.find((l) => l.code === 'H-E2E')!

    // Un padre no puede colgar de su propio descendiente.
    expect((await page.request.put(`/api/locations/${root.id}`, { data: { parentId: child.id } })).status()).toBe(400)
    // Un padre no puede ser sí mismo.
    expect((await page.request.put(`/api/locations/${root.id}`, { data: { parentId: root.id } })).status()).toBe(400)

    // María (user 1) es miembro del proyecto 2: puede crear una ubicación allí.
    const project2Location = await createLocation(page, { name: 'Sede Centro', code: 'SEDE-C', projectId: 2, responsibleId: 1 })
    expect(project2Location.status).toBe(201)

    // J. Ramírez (user 2) es miembro solo del proyecto 1: no puede ser
    // responsable de una ubicación del proyecto 2.
    const crossResponsible = await createLocation(page, { name: 'Cruzado 1', code: 'X1-E2E', projectId: 2, responsibleId: 2 })
    expect(crossResponsible.status).toBe(400)

    // Un padre de otro proyecto tampoco es válido: la ubicación (proyecto 1)
    // no puede colgar de una ubicación del proyecto 2.
    const crossParent = await createLocation(page, { name: 'Cruzado 2', code: 'X2-E2E', projectId: 1, parentId: project2Location.body.id })
    expect(crossParent.status).toBe(400)
  })

  test('creates an asset and assigns it to a location, filtering by branch', async ({ page }) => {
    const tree = await locations(page)
    const child = tree.find((l) => l.code === 'H-E2E')!

    const [typesRes, statusesRes] = await Promise.all([
      page.request.get('/api/asset-types'),
      page.request.get('/api/statuses'),
    ])
    const types = await typesRes.json() as Array<{ id: number; name: string }>
    const statuses = await statusesRes.json() as Array<{ id: number; name: string }>
    const createAsset = await page.request.post('/api/assets', {
      data: {
        code: 'ACT-E2E',
        name: 'Activo de rama',
        serialNumber: 'ACT-E2E',
        installDate: '2026-07-15',
        typeId: types[0].id,
        statusId: statuses[0].id,
        locationId: child.id,
        projectId: 1,
        responsibleId: 1,
        initials: 'AE',
      },
    })
    expect(createAsset.status()).toBe(201)

    // El filtro por la rama padre incluye los activos de toda su subrama.
    const filtered = await page.request.get(`/api/assets?locationId=${child.id}`)
    expect((await filtered.json() as { total: number }).total).toBe(1)
  })

  test('rejects assets whose location or responsible belongs to another project', async ({ page }) => {
    const tree = await locations(page)
    const child = tree.find((l) => l.code === 'H-E2E')!

    const [typesRes, statusesRes, usersRes] = await Promise.all([
      page.request.get('/api/asset-types'),
      page.request.get('/api/statuses'),
      page.request.get('/api/users'),
    ])
    const types = await typesRes.json() as Array<{ id: number; name: string }>
    const statuses = await statusesRes.json() as Array<{ id: number; name: string }>
    const users = await usersRes.json() as Array<{ id: number; name: string }>
    const project1OnlyUser = users.find((user) => user.name.includes('Ramírez')) ?? users[1]

    // Ubicación del proyecto 2 para el caso cross-project.
    const project2Location = await createLocation(page, { name: 'Sede QA E2E', code: 'QA-SEDE-E2E', projectId: 2, responsibleId: users[0].id })
    expect(project2Location.status).toBe(201)

    const base = {
      name: 'Activo de relaciones E2E',
      serialNumber: 'QA-REL-SN',
      installDate: '2026-07-15',
      typeId: types[0].id,
      statusId: statuses[0].id,
      projectId: 1,
      responsibleId: users[0].id,
      initials: 'QA',
    }

    try {
      // Positivo: ubicación y responsable del proyecto del activo.
      const ok = await page.request.post('/api/assets', { data: { ...base, code: 'QA-OK', locationId: child.id } })
      expect(ok.status()).toBe(201)
      const okId = ((await ok.json()) as { id: number }).id

      // Negativo: la ubicación pertenece a otro proyecto.
      const crossLocation = await page.request.post('/api/assets', { data: { ...base, code: 'QA-XLOC', locationId: project2Location.body.id } })
      expect(crossLocation.status()).toBe(400)

      // Negativo: el responsable no es miembro del proyecto del activo.
      const crossResponsible = await page.request.post('/api/assets', { data: { ...base, code: 'QA-XRES', projectId: 2, responsibleId: project1OnlyUser.id } })
      expect(crossResponsible.status()).toBe(400)

      // Negativo (PUT parcial): mover solo el proyecto deja las relaciones
      // existentes (ubicación y responsable) fuera del proyecto.
      const partialProject = await page.request.put(`/api/assets/${okId}`, { data: { projectId: 2 } })
      expect(partialProject.status()).toBe(400)

      // Positivo (PUT parcial coherente): cambiar solo el nombre no rompe nada.
      const partialName = await page.request.put(`/api/assets/${okId}`, { data: { name: 'Activo QA renombrado' } })
      expect(partialName.status()).toBe(200)

      expect((await page.request.delete(`/api/assets/${okId}`)).status()).toBe(204)
    } finally {
      await page.request.delete(`/api/locations/${project2Location.body.id}`)
    }
  })

  test('tree and detail show the same count for a branch', async ({ page }) => {
    await goToLocations(page)
    // Hijo E2E es la selección por defecto (contiene el activo) y su rama está abierta.
    await page.locator('summary', { hasText: 'Hijo E2E' }).click()

    // Hijo E2E tiene el activo ACT-E2E en su subrama (nieto vacío).
    const treeCount = await page.locator('summary', { hasText: /Hijo E2E/ }).locator('span.ml-auto').textContent()
    const activosCard = page.locator('.xl\\:col-span-2 div').filter({ hasText: /^Activos$/ }).last()
    await expect(activosCard).toBeVisible()
    const detailCount = await activosCard.locator('xpath=following-sibling::div').textContent()
    expect(treeCount?.trim()).toBe(detailCount?.trim())
  })

  test('updates the sidebar count when creating and deleting an asset', async ({ page }) => {
    await page.goto('/assets')
    await expect(page.getByRole('heading', { name: 'Activos', exact: true })).toBeVisible()
    const before = await page.locator('aside').getByText(/activos$/).first().textContent()

    await page.getByRole('button', { name: 'Nuevo activo', exact: true }).last().click()
    const dialog = page.getByRole('dialog', { name: 'Nuevo activo' })
    await dialog.locator('#asset-code').fill('SIDE-E2E')
    await dialog.locator('#asset-name').fill('Activo sidebar E2E')
    await dialog.locator('#asset-serial-number').fill('SIDE-SN')
    await dialog.locator('#asset-install-date').fill('2026-07-15')
    await dialog.locator('#asset-location').selectOption({ index: 1 })
    await dialog.locator('#asset-type').selectOption({ index: 1 })
    await dialog.locator('#asset-status').selectOption({ index: 1 })
    await dialog.locator('#asset-initials').fill('SE')
    const createResponse = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/api/assets'))
    await dialog.getByRole('button', { name: 'Crear activo', exact: true }).click()
    expect((await createResponse).status()).toBe(201)

    // El Sidebar se actualiza sin recargar la página (recarga asíncrona de la sesión).
    const countOf = (text: string | null) => Number(text?.match(/(\d+) activos$/)?.[1])
    const expectedCount = countOf(before) + 1
    await expect(page.locator('aside').getByText(/activos$/).first()).toHaveText(new RegExp(`· ${expectedCount} activos$`))
    const after = await page.locator('aside').getByText(/activos$/).first().textContent()
    expect(countOf(after)).toBe(expectedCount)

    // Borrado por el mismo endpoint DELETE que la aplicación expone para
    // eliminar activos: al recargar, la sesión se vuelve a cargar y el conteo
    // del Sidebar desciende reflejando el estado real.
    const asset = await page.request.get('/api/assets?search=SIDE-E2E')
    const assetId = ((await asset.json()).data[0].id) as number
    expect((await page.request.delete(`/api/assets/${assetId}`)).status()).toBe(204)
    const sessionResponse = page.waitForResponse((r) => r.url().includes('/api/session') && r.request().method() === 'GET')
    await page.reload()
    await sessionResponse
    await expect(page.locator('aside').getByText(/activos$/).first()).toHaveText(new RegExp(`· ${expectedCount - 1} activos$`))
  })

  test('blocks deleting a location with assets or any child, deletes an empty leaf', async ({ page }) => {
    const tree = await locations(page)
    const root = tree.find((l) => l.code === 'R-E2E')!
    const child = tree.find((l) => l.code === 'H-E2E')!
    const grandchild = tree.find((l) => l.code === 'N-E2E')!

    // Hijo tiene activos en su subrama y un nieto: bloqueado.
    expect((await page.request.delete(`/api/locations/${child.id}`)).status()).toBe(409)
    // Raíz tiene hijos: bloqueado aunque no tenga activos propios.
    expect((await page.request.delete(`/api/locations/${root.id}`)).status()).toBe(409)

    // El nieto está vacío y sin hijos: se puede borrar.
    expect((await page.request.delete(`/api/locations/${grandchild.id}`)).status()).toBe(204)
  })

  test('no inaccessible locations remain and persistence survives reload', async ({ page }) => {
    const tree = await locations(page)
    const project1 = tree.filter((l) => l.code !== 'ECC-PL1')

    await goToLocations(page)
    // Cada ubicación del proyecto (más el nodo raíz) está renderizada en el
    // árbol: no quedan filas ocultas ni inaccesibles.
    const treeNodes = page.locator('.xl\\:col-span-1 details summary, .xl\\:col-span-1 a')
    await expect(treeNodes).toHaveCount(project1.length + 1)
    for (const location of project1) {
      await expect(page.locator('summary, a', { hasText: location.name }).first()).toBeVisible()
    }

    // Persistencia: el nieto borrado ya no aparece y el resto sigue.
    await page.reload()
    await expect(page.getByText('Nieto E2E', { exact: true })).toHaveCount(0)
    await expect(page.locator('summary', { hasText: 'Raíz E2E' })).toBeVisible()

    // Restaurar el seed canónico para el resto de la suite.
    await runDbScript('db:seed', e2eEnv)
  })
})
