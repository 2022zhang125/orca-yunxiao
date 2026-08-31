import React, { useEffect, useState } from 'react'
import { Download, ExternalLink, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { translate } from '@/i18n/i18n'
import type { YunxiaoDefectAttachment } from '@/components/task-page-yunxiao-defect-report'
import type { YunxiaoWorkItemFile } from '../../../shared/yunxiao-types'

/** Trades a 云效 file id for a pre-signed link. Null when it cannot be resolved. */
export type YunxiaoAttachmentResolver = (
  attachment: YunxiaoDefectAttachment
) => Promise<YunxiaoWorkItemFile | null>

// Everything 云效 lets you attach that a <video> element can actually play.
const VIDEO_SUFFIXES = new Set(['mp4', 'webm', 'ogg', 'ogv', 'mov', 'm4v'])
const IMAGE_SUFFIXES = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'ico'])

type ResolvedState =
  | { kind: 'loading' }
  | { kind: 'ready'; file: YunxiaoWorkItemFile }
  | { kind: 'error' }

function suffixOf(file: YunxiaoWorkItemFile): string {
  return (file.suffix ?? file.name.split('.').pop() ?? '').toLowerCase()
}

function formatSize(bytes: number | undefined): string | null {
  if (bytes === undefined) {
    return null
  }
  const mb = bytes / 1024 / 1024
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/**
 * The rendered file. Images and video play inline; anything else 云效 accepts
 * (logs, zips, office docs) has no viewer worth building, so it offers the
 * download instead of pretending to preview.
 */
function AttachmentSurface({ file }: { file: YunxiaoWorkItemFile }): React.JSX.Element {
  const suffix = suffixOf(file)
  if (IMAGE_SUFFIXES.has(suffix)) {
    return (
      <img
        src={file.url}
        alt={file.name}
        className="max-h-full max-w-full object-contain"
        // The signed link outlives the dialog; a stale one shows the fallback.
        draggable={false}
      />
    )
  }
  if (VIDEO_SUFFIXES.has(suffix)) {
    // No <track>: 云效 stores the media alone, with no caption file to point at.
    return <video src={file.url} controls autoPlay className="max-h-full max-w-full" />
  }
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <p className="text-[13px] text-muted-foreground">
        {translate(
          'auto.components.TaskPage.yunxiao_attachment_no_preview',
          'No preview for .{{value0}} files.',
          { value0: suffix || 'bin' }
        )}
      </p>
      <Button variant="secondary" size="sm" onClick={() => window.api.shell.openUrl(file.url)}>
        <Download className="size-3.5" />
        {translate('auto.components.TaskPage.yunxiao_attachment_download', 'Download')}
      </Button>
    </div>
  )
}

function ViewerBody({ state }: { state: ResolvedState }): React.JSX.Element {
  switch (state.kind) {
    case 'loading':
      return (
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {translate('auto.components.TaskPage.yunxiao_attachment_loading', 'Opening attachment…')}
        </div>
      )
    case 'error':
      return (
        <p className="max-w-sm text-center text-[13px] text-muted-foreground">
          {translate(
            'auto.components.TaskPage.yunxiao_attachment_failed',
            'This attachment could not be opened. It may have been removed, or the 云效 account may not have access to it.'
          )}
        </p>
      )
    case 'ready':
      return <AttachmentSurface file={state.file} />
  }
}

/**
 * Shows a work item attachment in place. 云效's own image URLs are guarded by a
 * web session Orca does not have, so the viewer resolves each one through the
 * file endpoint first — the link it returns is signed and short-lived, which is
 * why resolution happens on open rather than when the row expands.
 */
export function TaskPageYunxiaoAttachmentViewer({
  attachment,
  resolve,
  onClose
}: {
  attachment: YunxiaoDefectAttachment | null
  resolve: YunxiaoAttachmentResolver
  onClose: () => void
}): React.JSX.Element | null {
  const [state, setState] = useState<ResolvedState>({ kind: 'loading' })

  useEffect(() => {
    if (!attachment) {
      return
    }
    let active = true
    setState({ kind: 'loading' })
    void resolve(attachment)
      .then((file) => {
        if (active) {
          setState(file ? { kind: 'ready', file } : { kind: 'error' })
        }
      })
      .catch(() => {
        if (active) {
          setState({ kind: 'error' })
        }
      })
    return () => {
      active = false
    }
  }, [attachment, resolve])

  if (!attachment) {
    return null
  }
  const file = state.kind === 'ready' ? state.file : null
  const size = formatSize(file?.sizeBytes)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton
        className="flex h-[80vh] w-[80vw] max-w-[80vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[80vw]"
      >
        <DialogTitle className="sr-only">{file?.name ?? attachment.name}</DialogTitle>
        <DialogDescription className="sr-only">
          {translate(
            'auto.components.TaskPage.yunxiao_attachment_dialog_description',
            'Attachment preview'
          )}
        </DialogDescription>
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-3 py-2">
          <span className="min-w-0 truncate text-[13px] font-medium text-foreground">
            {file?.name ?? attachment.name}
          </span>
          {size ? (
            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{size}</span>
          ) : null}
          {file ? (
            <Button
              variant="ghost"
              size="icon-xs"
              className="ml-auto mr-6"
              onClick={() => window.api.shell.openUrl(file.url)}
              aria-label={translate(
                'auto.components.TaskPage.yunxiao_attachment_open_external',
                'Open in browser'
              )}
            >
              <ExternalLink className="size-3.5" />
            </Button>
          ) : null}
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-muted p-4 scrollbar-sleek">
          <ViewerBody state={state} />
        </div>
      </DialogContent>
    </Dialog>
  )
}
