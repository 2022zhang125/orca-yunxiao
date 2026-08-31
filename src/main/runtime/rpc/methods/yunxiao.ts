import { z } from 'zod'
import { defineMethod, type RpcMethod } from '../core'
import {
  OptionalFiniteNumber,
  OptionalPlainString,
  OptionalString,
  requiredString
} from '../schemas'

const VALID_FILTERS = ['assigned', 'created', 'all', 'done'] as const
const VALID_CATEGORIES = ['Req', 'Task', 'Bug'] as const

const AccountSelection = z
  .object({
    accountId: OptionalString
  })
  .optional()

const Connect = z.object({
  organizationId: requiredString('Organization ID is required'),
  accessToken: requiredString('Personal access token is required'),
  endpoint: OptionalPlainString
})

const SelectAccount = z.object({
  accountId: requiredString('Account ID is required')
})

const SearchWorkItems = z.object({
  query: requiredString('Missing query'),
  limit: OptionalFiniteNumber,
  accountId: OptionalString
})

const ListWorkItems = z
  .object({
    filter: z.enum(VALID_FILTERS).optional(),
    limit: OptionalFiniteNumber,
    accountId: OptionalString,
    projectId: OptionalString
  })
  .optional()

const WorkItemId = z.object({
  workItemId: requiredString('Work item ID is required'),
  accountId: OptionalString
})

const WorkItemFile = z.object({
  workItemId: requiredString('Work item ID is required'),
  fileId: requiredString('File ID is required'),
  accountId: OptionalString
})

const CreateWorkItem = z.object({
  accountId: OptionalString,
  spaceId: requiredString('Project is required'),
  workItemTypeId: requiredString('Work item type is required'),
  title: requiredString('Title is required'),
  description: OptionalPlainString,
  assigneeUserId: OptionalString
})

const WorkItemUpdate = z.object({
  workItemId: requiredString('Work item ID is required'),
  accountId: OptionalString,
  updates: z.object({
    title: OptionalString,
    statusId: OptionalString,
    assigneeUserId: z.union([z.string(), z.null()]).optional(),
    priority: z.union([z.string(), z.null()]).optional(),
    labels: z.array(z.string()).optional()
  })
})

const WorkItemComment = z.object({
  workItemId: requiredString('Work item ID is required'),
  body: requiredString('Comment body is required'),
  accountId: OptionalString
})

const WorkItemTypes = z.object({
  spaceId: requiredString('Project is required'),
  category: z.enum(VALID_CATEGORIES).optional(),
  accountId: OptionalString
})

export const YUNXIAO_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'yunxiao.connect',
    params: Connect,
    handler: async (params, { runtime }) =>
      runtime.yunxiaoConnect({
        organizationId: params.organizationId.trim(),
        accessToken: params.accessToken.trim(),
        endpoint: params.endpoint?.trim() || undefined
      })
  }),
  defineMethod({
    name: 'yunxiao.disconnect',
    params: AccountSelection,
    handler: async (params, { runtime }) => runtime.yunxiaoDisconnect(params?.accountId)
  }),
  defineMethod({
    name: 'yunxiao.selectAccount',
    params: SelectAccount,
    handler: async (params, { runtime }) => runtime.yunxiaoSelectAccount(params.accountId.trim())
  }),
  defineMethod({
    name: 'yunxiao.status',
    params: null,
    handler: async (_params, { runtime }) => runtime.yunxiaoStatus()
  }),
  defineMethod({
    name: 'yunxiao.testConnection',
    params: AccountSelection,
    handler: async (params, { runtime }) => runtime.yunxiaoTestConnection(params?.accountId)
  }),
  defineMethod({
    name: 'yunxiao.searchWorkItems',
    params: SearchWorkItems,
    handler: async (params, { runtime }) =>
      runtime.yunxiaoSearchWorkItems(params.query, params.limit, params.accountId)
  }),
  defineMethod({
    name: 'yunxiao.listWorkItems',
    params: ListWorkItems,
    handler: async (params, { runtime }) =>
      runtime.yunxiaoListWorkItems(
        params?.filter,
        params?.limit,
        params?.accountId,
        params?.projectId
      )
  }),
  defineMethod({
    name: 'yunxiao.getWorkItem',
    params: WorkItemId,
    handler: async (params, { runtime }) =>
      runtime.yunxiaoGetWorkItem(params.workItemId.trim(), params.accountId)
  }),
  defineMethod({
    name: 'yunxiao.getWorkItemFile',
    params: WorkItemFile,
    handler: async (params, { runtime }) =>
      runtime.yunxiaoGetWorkItemFile(
        params.workItemId.trim(),
        params.fileId.trim(),
        params.accountId
      )
  }),
  defineMethod({
    name: 'yunxiao.createWorkItem',
    params: CreateWorkItem,
    handler: async (params, { runtime }) =>
      runtime.yunxiaoCreateWorkItem({
        accountId: params.accountId,
        spaceId: params.spaceId.trim(),
        workItemTypeId: params.workItemTypeId.trim(),
        title: params.title.trim(),
        description: params.description?.trim() || undefined,
        assigneeUserId: params.assigneeUserId
      })
  }),
  defineMethod({
    name: 'yunxiao.updateWorkItem',
    params: WorkItemUpdate,
    handler: async (params, { runtime }) =>
      runtime.yunxiaoUpdateWorkItem(params.workItemId.trim(), params.updates, params.accountId)
  }),
  defineMethod({
    name: 'yunxiao.addWorkItemComment',
    params: WorkItemComment,
    handler: async (params, { runtime }) =>
      runtime.yunxiaoAddWorkItemComment(
        params.workItemId.trim(),
        params.body.trim(),
        params.accountId
      )
  }),
  defineMethod({
    name: 'yunxiao.workItemComments',
    params: WorkItemId,
    handler: async (params, { runtime }) =>
      runtime.yunxiaoWorkItemComments(params.workItemId.trim(), params.accountId)
  }),
  defineMethod({
    name: 'yunxiao.listProjects',
    params: AccountSelection,
    handler: async (params, { runtime }) => runtime.yunxiaoListProjects(params?.accountId)
  }),
  defineMethod({
    name: 'yunxiao.listWorkItemTypes',
    params: WorkItemTypes,
    handler: async (params, { runtime }) =>
      runtime.yunxiaoListWorkItemTypes(params.spaceId.trim(), params.category, params.accountId)
  })
]
