import { describe, expect, it } from 'vitest'
import { normalizeWorkItem, toArray, toIsoDate } from './work-item-normalizers'
import type { YunxiaoClientForAccount } from './request'

const client: YunxiaoClientForAccount = {
  account: {
    id: 'acct-1',
    endpoint: 'https://openapi-rdc.aliyuncs.com',
    organizationId: 'org-1',
    organizationName: 'Acme',
    userId: 'user-1',
    displayName: 'Ada',
    email: 'ada@example.com'
  },
  accessToken: 'token'
}

describe('yunxiao work item normalizers', () => {
  it('unwraps collections from every envelope shape 云效 returns', () => {
    expect(toArray([1, 2])).toEqual([1, 2])
    expect(toArray({ result: [1] })).toEqual([1])
    expect(toArray({ workitems: [2] })).toEqual([2])
    expect(toArray({ nothing: true })).toEqual([])
  })

  it('normalizes epoch and ISO timestamps to ISO strings', () => {
    expect(toIsoDate(0)).toBe('1970-01-01T00:00:00.000Z')
    expect(toIsoDate('2026-01-02T03:04:05.000Z')).toBe('2026-01-02T03:04:05.000Z')
    expect(toIsoDate(undefined)).toBe('1970-01-01T00:00:00.000Z')
  })

  it('maps a search result onto the shared work item shape', () => {
    const workItem = normalizeWorkItem(client, {
      id: 'wi-1',
      serialNumber: 'REQ-42',
      subject: 'Ship 云效 tasks',
      spaceIdentifier: 'space-9',
      categoryIdentifier: 'Bug',
      status: { id: 'st-1', name: '进行中', stageIdentifier: 'PROCESSING' },
      assignedTo: { id: 'user-2', name: 'Grace' },
      gmtCreate: 1_700_000_000_000,
      gmtModified: 1_700_000_600_000,
      labels: [{ name: 'urgent' }, 'regression']
    })

    expect(workItem).not.toBeNull()
    expect(workItem?.serialNumber).toBe('REQ-42')
    expect(workItem?.title).toBe('Ship 云效 tasks')
    expect(workItem?.workItemType.category).toBe('Bug')
    expect(workItem?.status.stage).toBe('in-progress')
    expect(workItem?.assignee?.displayName).toBe('Grace')
    expect(workItem?.labels).toEqual([{ name: 'urgent' }, { name: 'regression' }])
    expect(workItem?.project.id).toBe('space-9')
    expect(workItem?.organizationName).toBe('Acme')
    expect(workItem?.url).toContain('/projex/project/space-9/task/wi-1')
    expect(workItem?.url).toContain('orgId=org-1')
  })

  it('falls back to the raw id when 云效 omits a serial number, and drops id-less rows', () => {
    expect(normalizeWorkItem(client, { identifier: 'wi-2' })?.serialNumber).toBe('wi-2')
    expect(normalizeWorkItem(client, { subject: 'no id' })).toBeNull()
    expect(normalizeWorkItem(client, 'not-an-object')).toBeNull()
  })

  it('keeps hex label colors and drops values that are not safe to inline as CSS', () => {
    const workItem = normalizeWorkItem(client, {
      id: 'wi-4',
      labels: [
        { name: 'feature', color: '#3076ED' },
        { name: 'injected', color: 'red; background: url(evil)' },
        { name: 'named', color: 'rebeccapurple' },
        { name: 'plain' }
      ]
    })

    expect(workItem?.labels).toEqual([
      { name: 'feature', color: '#3076ED' },
      { name: 'injected' },
      { name: 'named' },
      { name: 'plain' }
    ])
  })

  it('reads the categoryId spelling workitems:search actually returns', () => {
    // Real search payload shape: categoryId on the record, none on workitemType.
    const workItem = normalizeWorkItem(client, {
      id: 'wi-bug',
      categoryId: 'Bug',
      workitemType: { id: '37da3a07df4d08aef2e3b393', name: '缺陷' }
    })
    expect(workItem?.workItemType.category).toBe('Bug')
    expect(
      normalizeWorkItem(client, { id: 'wi-task', categoryId: 'Task' })?.workItemType.category
    ).toBe('Task')
  })

  it('reads the numeric statusStageId workitems:search actually returns', () => {
    const stageOf = (statusStageId: string): string | undefined =>
      normalizeWorkItem(client, { id: `wi-${statusStageId}`, statusStageId })?.status.stage

    expect(stageOf('1')).toBe('todo')
    expect(stageOf('2')).toBe('in-progress')
    expect(stageOf('3')).toBe('done')
    // 已关闭 lives in its own stage; it is still finished work.
    expect(stageOf('4')).toBe('done')
  })

  it('normalizes a verbatim in-progress defect row into the fix-eligible shape', () => {
    // Field-for-field shape of a real workitems:search row (SCRM RTOH-106).
    const workItem = normalizeWorkItem(client, {
      id: '0b5df2fbd7b3c7700c763b1781',
      subject: '【商户端 客户画像管理】添加，字段类型 用户标签 和 客户标签 无意义',
      workitemType: { id: '37da3a07df4d08aef2e3b393', name: '缺陷' },
      status: { displayName: '处理中', id: '100010', name: '处理中', nameEn: 'In Progress' },
      categoryId: 'Bug',
      serialNumber: 'RTOH-106',
      statusStageId: '2',
      assignedTo: { id: 'user-1', name: '张亚洲' },
      space: { id: 'd440a05edafd9b7c20bdc62597', name: 'SCRM' },
      gmtCreate: 1_784_628_406_000,
      gmtModified: 1_784_630_950_000
    })

    expect(workItem?.workItemType.category).toBe('Bug')
    expect(workItem?.status.stage).toBe('in-progress')
    expect(workItem?.status.name).toBe('处理中')
  })

  it('treats an unknown workflow stage as unknown rather than done', () => {
    const workItem = normalizeWorkItem(client, {
      id: 'wi-3',
      status: 'Custom',
      statusStageIdentifier: 'SOMETHING_ELSE'
    })
    expect(workItem?.status.name).toBe('Custom')
    expect(workItem?.status.stage).toBe('unknown')
  })
})
