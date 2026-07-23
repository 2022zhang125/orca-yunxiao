import { describe, expect, it } from 'vitest'
import { buildSearchBody, matchesWorkItemFilter, workItemRelevanceRank } from './work-items'
import { readCustomFieldValue } from './work-item-normalizers'
import type {
  YunxiaoStatusStage,
  YunxiaoWorkItem,
  YunxiaoWorkItemCategory
} from '../../shared/types'

const base = { spaceId: 'space-1', limit: 50 }

const ME = 'user-me'

function workItem(overrides: {
  category?: YunxiaoWorkItemCategory
  stage?: YunxiaoStatusStage
  assignee?: string
  creator?: string
}): YunxiaoWorkItem {
  return {
    id: 'wi-1',
    serialNumber: 'DEMO-1',
    title: 'Item',
    url: 'https://devops.aliyun.com/wi-1',
    project: { id: 'space-1', name: 'Space' },
    workItemType: {
      id: 't',
      name: 'Type',
      category: overrides.category ?? 'Req'
    },
    status: { id: 's', name: 'Status', stage: overrides.stage ?? 'todo' },
    labels: [],
    assignee: overrides.assignee ? { userId: overrides.assignee, displayName: 'A' } : undefined,
    creator: overrides.creator ? { userId: overrides.creator, displayName: 'C' } : undefined,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  }
}

describe('yunxiao work item search body', () => {
  it('scopes the done preset to the end stage id the API actually matches', () => {
    // 'END' is the symbolic name and matches nothing; the API filters on '3'.
    expect(buildSearchBody({ ...base, filter: 'done' }).statusStage).toBe('3,4')
  })

  it('maps assignee and creator presets to the self shorthand', () => {
    const assigned = buildSearchBody({ ...base, filter: 'assigned' })
    expect(assigned.assignedTo).toBe('self')
    expect(assigned.creator).toBeUndefined()

    const created = buildSearchBody({ ...base, filter: 'created' })
    expect(created.creator).toBe('self')
    expect(created.assignedTo).toBeUndefined()
  })

  it('leaves the all preset unfiltered', () => {
    const all = buildSearchBody({ ...base, filter: 'all' })
    expect(all.assignedTo).toBeUndefined()
    expect(all.creator).toBeUndefined()
    expect(all.statusStage).toBeUndefined()
  })

  it('always asks for a full page so the relevance ranking has something to rank', () => {
    // Fetching only `limit` per project lets page 1 decide the list outright.
    expect(buildSearchBody({ ...base, filter: 'assigned', limit: 30 }).perPage).toBe(200)
    expect(buildSearchBody({ ...base, filter: 'all', limit: 1 }).perPage).toBe(200)
  })

  it('sorts by a field the API actually accepts', () => {
    // gmtModified is not in 云效's orderBy set, so it was silently discarded.
    expect(buildSearchBody({ ...base, filter: 'assigned' }).orderBy).toBe('gmtCreate')
  })
})

describe('yunxiao preset re-applied on the normalized result', () => {
  it('narrows assigned and created to the connected user', () => {
    const mine = workItem({ assignee: ME, creator: 'user-other' })
    expect(matchesWorkItemFilter(mine, 'assigned', ME)).toBe(true)
    expect(matchesWorkItemFilter(mine, 'created', ME)).toBe(false)

    const theirs = workItem({ assignee: 'user-other', creator: ME })
    expect(matchesWorkItemFilter(theirs, 'assigned', ME)).toBe(false)
    expect(matchesWorkItemFilter(theirs, 'created', ME)).toBe(true)
  })

  it('splits done from the open presets', () => {
    const done = workItem({ stage: 'done' })
    const todo = workItem({ stage: 'todo' })

    expect(matchesWorkItemFilter(done, 'done', ME)).toBe(true)
    expect(matchesWorkItemFilter(done, 'all', ME)).toBe(false)
    expect(matchesWorkItemFilter(todo, 'done', ME)).toBe(false)
    expect(matchesWorkItemFilter(todo, 'all', ME)).toBe(true)
  })

  it('leaves in-progress work to Assigned instead of All Open', () => {
    const mine = workItem({ stage: 'in-progress', assignee: ME })

    expect(matchesWorkItemFilter(mine, 'all', ME)).toBe(false)
    expect(matchesWorkItemFilter(mine, 'assigned', ME)).toBe(true)
  })

  it('keeps an unmapped stage in All Open rather than hiding it', () => {
    expect(matchesWorkItemFilter(workItem({ stage: 'unknown' }), 'all', ME)).toBe(true)
  })
})

describe('yunxiao work item relevance rank', () => {
  const viewers = new Set([ME])
  const rank = (item: YunxiaoWorkItem): number => workItemRelevanceRank(item, viewers)

  it('puts my open bugs first and my resolved bugs behind other open work', () => {
    const myOpenBug = rank(workItem({ category: 'Bug', assignee: ME }))
    const myOpenTask = rank(workItem({ category: 'Task', assignee: ME }))
    const othersOpenBug = rank(workItem({ category: 'Bug', assignee: 'user-other' }))
    const myDoneBug = rank(workItem({ category: 'Bug', stage: 'done', assignee: ME }))
    const othersTask = rank(workItem({ category: 'Task', assignee: 'user-other' }))

    expect(myOpenBug).toBeLessThan(myOpenTask)
    expect(myOpenTask).toBeLessThan(othersOpenBug)
    expect(othersOpenBug).toBeLessThan(myDoneBug)
    expect(myDoneBug).toBeLessThan(othersTask)
  })

  it('keeps 暂不修复 and 重新打开 ranked as outstanding, not as finished work', () => {
    // Both sit in a finished stage, so ranking them by stage buried them under
    // every recently closed defect and they fell out of the Assigned list.
    const deferred = workItem({ category: 'Bug', stage: 'done', assignee: ME })
    const unfixed = { ...deferred, status: { id: 's', name: '暂不修复', stage: 'done' as const } }
    const reopened = { ...deferred, status: { id: 's', name: '重新打开', stage: 'done' as const } }
    const fixed = { ...deferred, status: { id: 's', name: '已修复', stage: 'done' as const } }
    const openBug = rank(workItem({ category: 'Bug', stage: 'in-progress', assignee: ME }))

    expect(rank(unfixed)).toBe(openBug)
    expect(rank(reopened)).toBe(openBug)
    expect(rank(unfixed)).toBeLessThan(rank(fixed))
  })

  it('does not treat an unassigned item as mine', () => {
    expect(rank(workItem({ category: 'Bug' }))).toBe(
      rank(workItem({ category: 'Bug', assignee: 'user-other' }))
    )
  })
})

describe('yunxiao custom field reads', () => {
  it('reads priority from the custom field, which is where search puts it', () => {
    // workitems:search has no top-level priority key at all, so the old read
    // left every row labelled "No priority".
    expect(
      readCustomFieldValue(
        {
          customFieldValues: [
            {
              fieldId: 'seriousLevel',
              fieldName: '严重程度',
              values: [{ displayValue: '3-一般' }]
            },
            { fieldId: 'priority', fieldName: '优先级', values: [{ displayValue: '中' }] }
          ]
        },
        'priority'
      )
    ).toBe('中')
  })

  it('returns undefined when the field is absent or empty', () => {
    expect(readCustomFieldValue({ customFieldValues: [] }, 'priority')).toBeUndefined()
    expect(readCustomFieldValue({}, 'priority')).toBeUndefined()
    expect(
      readCustomFieldValue({ customFieldValues: [{ fieldId: 'priority', values: [] }] }, 'priority')
    ).toBeUndefined()
  })
})
