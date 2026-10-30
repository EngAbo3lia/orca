import { describe, expect, it } from 'vitest'
import type { Repo } from '../../shared/repo-types'
import { automationAgentPrompt, automationRunReportingCli } from './automation-run-preamble'

const repo: Repo = {
  id: 'r1',
  path: '/work/repo',
  displayName: 'repo',
  badgeColor: '#000',
  addedAt: 1
}
const noDistro = (): undefined => undefined

describe('automationAgentPrompt', () => {
  it('leads with the run instructions and keeps the saved prompt verbatim as the task', () => {
    const prompt = automationAgentPrompt('Summarize  yesterday\n', 'orca')

    expect(prompt).toMatch(/orca automations warn --key/)
    expect(prompt).toMatch(/orca automations fail --message/)
    expect(prompt).toMatch(/orca automations attach --file/)
    expect(prompt.endsWith('=== TASK ===\nSummarize  yesterday\n')).toBe(true)
  })

  it('sends the saved prompt alone where reporting cannot reach the run', () => {
    expect(automationAgentPrompt('Summarize', null)).toBe('Summarize')
  })
})

describe('automationRunReportingCli', () => {
  it('does not advertise reporting to SSH or WSL terminals', () => {
    expect(
      automationRunReportingCli(
        { ok: true, cwd: '/work/repo', repo: { ...repo, connectionId: 'ssh-1' } },
        noDistro
      )
    ).toBeNull()
    expect(
      automationRunReportingCli(
        { ok: true, cwd: '\\\\wsl.localhost\\Ubuntu\\home\\me\\repo', repo },
        noDistro
      )
    ).toBeNull()
    expect(
      automationRunReportingCli({ ok: true, cwd: '/work/repo', repo }, () => 'Ubuntu')
    ).toBeNull()
    expect(
      automationRunReportingCli({ ok: true, cwd: '/work/repo', repo }, noDistro)
    ).not.toBeNull()
  })
})
