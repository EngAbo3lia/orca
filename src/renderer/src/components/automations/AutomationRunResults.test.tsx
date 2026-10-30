// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AutomationRun } from '../../../../shared/automations-types'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AutomationRunResults, type AutomationRunOutputActions } from './AutomationRunResults'

vi.mock('@/components/sidebar/CommentMarkdown', () => ({
  default: ({ content }: { content: string }) => <div>{content}</div>
}))

const run: AutomationRun = {
  id: 'run-1',
  automationId: 'a1',
  title: 'Run 1',
  scheduledFor: 1,
  status: 'completed',
  trigger: 'manual',
  workspaceId: null,
  sessionKind: 'terminal',
  chatSessionId: null,
  terminalSessionId: null,
  terminalPaneKey: null,
  terminalPtyId: null,
  outputSnapshot: null,
  precheckResult: null,
  usage: null,
  error: null,
  startedAt: 1,
  dispatchedAt: 1,
  createdAt: 1
}

function renderResults(current: AutomationRun, actions?: Partial<AutomationRunOutputActions>) {
  return render(
    <TooltipProvider>
      <AutomationRunResults
        run={current}
        actions={{ load: async () => '# Notes', open: () => {}, download: () => {}, ...actions }}
      />
    </TooltipProvider>
  )
}

afterEach(cleanup)

describe('AutomationRunResults', () => {
  it('says nothing was reported only when the agent was asked to report', () => {
    const { container, rerender } = renderResults(run)
    expect(container).toBeEmptyDOMElement()

    rerender(
      <TooltipProvider>
        <AutomationRunResults
          run={{ ...run, resultReporting: 'offered' }}
          actions={{ load: async () => '', open: () => {}, download: () => {} }}
        />
      </TooltipProvider>
    )
    expect(screen.getByText('No warnings reported.')).toBeInTheDocument()
  })

  it('shows reports open by default and collapses them from the row', async () => {
    const load = vi.fn(async () => '# Notes')
    renderResults(
      {
        ...run,
        outputs: [
          { id: 'o1', title: 'Notes', format: 'markdown', bytes: 7, sha256: '', attachedAt: 1 }
        ]
      },
      { load }
    )

    expect(await screen.findByText('# Notes')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Notes/ }))
    expect(screen.queryByText('# Notes')).not.toBeInTheDocument()
    expect(load).toHaveBeenCalledTimes(1)
  })
})
