import type { ElectronApplication, Page } from '@stablyai/playwright-test'

import { expect, test } from './helpers/orca-app'

const ACCOUNT = {
  id: 'yunxiao-account-a',
  endpoint: 'https://openapi-rdc.aliyuncs.com',
  organizationId: 'yunxiao-org-a',
  organizationName: 'Yunxiao E2E Org',
  userId: 'yunxiao-user-me',
  displayName: 'Yunxiao E2E User'
} as const

const PROJECTS = [
  { id: 'project-alpha', name: 'Alpha', accountId: ACCOUNT.id },
  { id: 'project-beta', name: 'Beta', accountId: ACCOUNT.id }
] as const

function workItem(args: {
  id: string
  serialNumber: string
  title: string
  project: (typeof PROJECTS)[number]
  assigneeUserId?: string
}) {
  return {
    id: args.id,
    serialNumber: args.serialNumber,
    title: args.title,
    accountId: ACCOUNT.id,
    organizationId: ACCOUNT.organizationId,
    organizationName: ACCOUNT.organizationName,
    url: `https://devops.aliyun.com/${args.id}`,
    project: args.project,
    workItemType: { id: 'bug', name: 'Bug', category: 'Bug' as const },
    status: { id: 'todo', name: '待处理', stage: 'todo' as const },
    labels: [],
    assignee: {
      userId: args.assigneeUserId ?? ACCOUNT.userId,
      displayName: args.assigneeUserId ?? ACCOUNT.displayName
    },
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-02T00:00:00.000Z'
  }
}

const ITEMS = [
  workItem({
    id: 'alpha-login',
    serialNumber: 'BUG-101',
    title: 'Fix login timeout',
    project: PROJECTS[0]
  }),
  workItem({
    id: 'alpha-other-user',
    serialNumber: 'BUG-102',
    title: 'Must stay hidden',
    project: PROJECTS[0],
    assigneeUserId: 'yunxiao-user-other'
  }),
  workItem({
    id: 'beta-deploy',
    serialNumber: 'BUG-202',
    title: 'Repair deployment pipeline',
    project: PROJECTS[1]
  }),
  workItem({
    id: 'beta-settings',
    serialNumber: 'BUG-203',
    title: 'Repair settings panel',
    project: PROJECTS[1]
  })
] as const

async function installYunxiaoBackend(electronApp: ElectronApplication): Promise<void> {
  await electronApp.evaluate(
    ({ ipcMain }, payload) => {
      ipcMain.removeHandler('yunxiao:status')
      ipcMain.handle('yunxiao:status', async () => ({
        connected: true,
        viewer: {
          userId: payload.account.userId,
          displayName: payload.account.displayName,
          email: null,
          organizationId: payload.account.organizationId,
          organizationName: payload.account.organizationName
        },
        accounts: [payload.account],
        activeAccountId: payload.account.id,
        selectedAccountId: payload.account.id
      }))

      ipcMain.removeHandler('yunxiao:listProjects')
      ipcMain.handle('yunxiao:listProjects', async () => payload.projects)

      ipcMain.removeHandler('yunxiao:listWorkItems')
      ipcMain.handle(
        'yunxiao:listWorkItems',
        async (_event, args: { projectId?: string } | undefined) =>
          payload.items.filter((item) => item.project.id === args?.projectId)
      )
    },
    { account: ACCOUNT, projects: PROJECTS, items: ITEMS }
  )
}

async function openYunxiaoTasks(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const store = window.__store
    if (!store) {
      throw new Error('window.__store is not available')
    }
    await store.getState().checkYunxiaoConnection()
    store.getState().openTaskPage({ taskSource: 'yunxiao' })
  })
}

test('switches Yunxiao projects and searches assigned work by title or Bug number', async ({
  electronApp,
  orcaPage
}) => {
  await installYunxiaoBackend(electronApp)
  await openYunxiaoTasks(orcaPage)

  const alphaTab = orcaPage.getByRole('tab', { name: 'Alpha', exact: true })
  const betaTab = orcaPage.getByRole('tab', { name: 'Beta', exact: true })
  await expect(alphaTab).toBeVisible()
  await expect(betaTab).toBeVisible()
  await expect(orcaPage.getByText('Fix login timeout', { exact: true })).toBeVisible()
  await expect(orcaPage.getByText('Must stay hidden', { exact: true })).toHaveCount(0)

  await betaTab.click()
  await expect(orcaPage.getByText('Repair deployment pipeline', { exact: true })).toBeVisible()

  const search = orcaPage.getByPlaceholder(/Bug/)
  await search.fill('203')
  await expect(orcaPage.getByText('Repair settings panel', { exact: true })).toBeVisible()
  await expect(orcaPage.getByText('Repair deployment pipeline', { exact: true })).toHaveCount(0)

  await search.fill('deployment')
  await expect(orcaPage.getByText('Repair deployment pipeline', { exact: true })).toBeVisible()
  await expect(orcaPage.getByText('Repair settings panel', { exact: true })).toHaveCount(0)
})
