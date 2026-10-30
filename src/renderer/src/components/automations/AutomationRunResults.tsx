import React from 'react'
import {
  ChevronRight,
  CircleCheck,
  Download,
  ExternalLink,
  FileCode,
  FileText,
  TriangleAlert
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import CommentMarkdown from '@/components/sidebar/CommentMarkdown'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { AutomationRun } from '../../../../shared/automations-types'
import type {
  AutomationRunOutput,
  AutomationRunWarning
} from '../../../../shared/automation-run-result-types'
import { AUTOMATION_EDITOR_SECTION_LABEL_CLASS } from './automation-page-parts'

export type AutomationRunOutputActions = {
  /** Resolves the stored file content; rejects when the host no longer has it. */
  load: (output: AutomationRunOutput) => Promise<string>
  open: (output: AutomationRunOutput) => void
  download: (output: AutomationRunOutput) => void
}

// The preview never reaches the network or runs scripts; links stay inert.
const HTML_PREVIEW_POLICY =
  "default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:"

function isolatedHtml(content: string): string {
  return `<meta http-equiv="Content-Security-Policy" content="${HTML_PREVIEW_POLICY}">${content}`
}

// File-format names are not translated.
const OUTPUT_FORMAT_NAME = { html: 'HTML', markdown: 'Markdown' } as const

function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${Math.ceil(bytes / 1024)} KB`
}

function SectionLabel({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className={cn(AUTOMATION_EDITOR_SECTION_LABEL_CLASS, 'mb-2 text-muted-foreground')}>
      {children}
    </div>
  )
}

function WarningRow({ warning }: { warning: AutomationRunWarning }): React.JSX.Element {
  const resolved = warning.resolvedAt !== null
  return (
    <li className={cn('flex gap-2 px-3 py-2.5', resolved && 'text-muted-foreground')}>
      {resolved ? (
        <CircleCheck className="mt-0.5 size-4 shrink-0" />
      ) : (
        <TriangleAlert className="mt-0.5 size-4 shrink-0" />
      )}
      <div className="min-w-0 flex-1 space-y-1 text-sm">
        <div className={cn('font-medium', !resolved && 'text-foreground')}>{warning.message}</div>
        {warning.impact ? <div className="text-muted-foreground">{warning.impact}</div> : null}
        {resolved ? (
          <div className="text-xs">
            {warning.resolution
              ? translate(
                  'auto.components.automations.AutomationRunResults.resolvedWith',
                  'Resolved: {{resolution}}',
                  { resolution: warning.resolution }
                )
              : translate('auto.components.automations.AutomationRunResults.resolved', 'Resolved')}
          </div>
        ) : null}
        {warning.evidence ? (
          <details className="group text-xs">
            <summary className="flex cursor-pointer list-none items-center gap-1 text-muted-foreground hover:text-foreground">
              <ChevronRight className="size-3 transition-transform group-open:rotate-90 motion-reduce:transition-none" />
              {translate('auto.components.automations.AutomationRunResults.evidence', 'Details')}
            </summary>
            <pre className="scrollbar-sleek mt-1.5 max-h-48 overflow-auto rounded-md border border-border/50 bg-muted/40 p-2 font-mono text-2xs whitespace-pre-wrap text-foreground">
              {warning.evidence}
            </pre>
          </details>
        ) : null}
      </div>
    </li>
  )
}

function IconAction({
  label,
  onClick,
  children
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={label} onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

function OutputPreview({
  output,
  load
}: {
  output: AutomationRunOutput
  load: AutomationRunOutputActions['load']
}): React.JSX.Element {
  const [state, setState] = React.useState<
    { kind: 'loading' } | { kind: 'ready'; content: string } | { kind: 'failed' }
  >({ kind: 'loading' })
  React.useEffect(() => {
    let current = true
    load(output).then(
      (content) => current && setState({ kind: 'ready', content }),
      () => current && setState({ kind: 'failed' })
    )
    return () => {
      current = false
    }
  }, [load, output])
  if (state.kind === 'failed') {
    return (
      <div className="px-3 pb-3 text-sm text-muted-foreground">
        {translate(
          'auto.components.automations.AutomationRunResults.previewUnavailable',
          'This file is no longer available on the host.'
        )}
      </div>
    )
  }
  if (state.kind === 'loading') {
    return <div className="mx-3 mb-3 h-24 rounded-md border border-border/50 bg-muted/30" />
  }
  return output.format === 'html' ? (
    <iframe
      title={output.title}
      sandbox=""
      srcDoc={isolatedHtml(state.content)}
      className="mx-3 mb-3 block h-[420px] w-[calc(100%-1.5rem)] rounded-md border border-border/50 bg-white"
    />
  ) : (
    <div className="mx-3 mb-3 rounded-md border border-border/50 px-4 py-3">
      <CommentMarkdown
        variant="document"
        content={state.content}
        className="text-sm leading-relaxed text-foreground"
      />
    </div>
  )
}

function OutputRow({
  output,
  actions
}: {
  output: AutomationRunOutput
  actions: AutomationRunOutputActions
}): React.JSX.Element {
  // The report is the run's result, so it starts open.
  const [expanded, setExpanded] = React.useState(true)
  const Icon = output.format === 'html' ? FileCode : FileText
  return (
    <li>
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          onClick={() => setExpanded((value) => !value)}
        >
          <ChevronRight
            className={cn(
              'size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none',
              expanded && 'rotate-90'
            )}
          />
          <Icon className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-foreground">
              {output.title}
            </span>
            <span className="block text-xs text-muted-foreground">
              {OUTPUT_FORMAT_NAME[output.format]} · {formatBytes(output.bytes)}
            </span>
          </span>
        </button>
        <IconAction
          label={translate('auto.components.automations.AutomationRunResults.open', 'Open')}
          onClick={() => actions.open(output)}
        >
          <ExternalLink className="size-4" />
        </IconAction>
        <IconAction
          label={translate('auto.components.automations.AutomationRunResults.download', 'Download')}
          onClick={() => actions.download(output)}
        >
          <Download className="size-4" />
        </IconAction>
      </div>
      {expanded ? <OutputPreview output={output} load={actions.load} /> : null}
    </li>
  )
}

/** Agent-reported warnings and attached files; neither proves the run succeeded. */
export function AutomationRunResults({
  run,
  actions,
  className
}: {
  run: AutomationRun
  actions: AutomationRunOutputActions
  className?: string
}): React.JSX.Element | null {
  const warnings = run.warnings ?? []
  const outputs = run.outputs ?? []
  const silent =
    run.resultReporting === 'offered' && run.status === 'completed' && warnings.length === 0
  if (warnings.length === 0 && outputs.length === 0 && !silent) {
    return null
  }
  // Open problems first; recovered ones stay as history below them.
  const ordered = warnings.toSorted(
    (left, right) => Number(left.resolvedAt !== null) - Number(right.resolvedAt !== null)
  )
  return (
    <div className={cn('space-y-4', className)}>
      {warnings.length > 0 ? (
        <section>
          <SectionLabel>
            {translate('auto.components.automations.AutomationRunResults.warnings', 'Warnings')}
          </SectionLabel>
          <ul className="divide-y divide-border/50 rounded-md border border-border/50">
            {ordered.map((warning) => (
              <WarningRow key={warning.key} warning={warning} />
            ))}
          </ul>
        </section>
      ) : silent ? (
        <div className="text-xs text-muted-foreground">
          {translate(
            'auto.components.automations.AutomationRunResults.noWarningsReported',
            'No warnings reported.'
          )}
        </div>
      ) : null}
      {outputs.length > 0 ? (
        <section>
          <SectionLabel>
            {translate('auto.components.automations.AutomationRunResults.outputs', 'Outputs')}
          </SectionLabel>
          <ul className="divide-y divide-border/50 rounded-md border border-border/50">
            {outputs.map((output) => (
              <OutputRow key={output.id} output={output} actions={actions} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
