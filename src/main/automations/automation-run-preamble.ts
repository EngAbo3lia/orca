import {
  localOrchestrationCliCommand,
  type OrchestrationCliCommand
} from '../runtime/orchestration/cli-command'
import { isWslUncPath } from '../../shared/wsl-paths'
import type { AutomationRunTargetResult } from './run-target-resolution'

/** Same verbs on every surface; only the executable varies, as in the orchestration preamble. */
export function buildAutomationRunPreamble(cli: OrchestrationCliCommand): string {
  return `You are running an Orca automation. Orca records this run's result: use the
commands below to report to it. They apply to the current run automatically.

=== CLI COMMANDS ===

\`\`\`sh
  # The result will be incomplete: a source was unavailable, checks were not run,
  # or you used an allowed lower-quality fallback. Report it as soon as you know.
  # Reuse the same --key for the same problem; do not create a new key per retry.
  ${cli} automations warn --key "<short-id>" --message "<what is missing>" --impact "<why it matters>" --evidence "<relevant error output>"

  # The missing work later succeeded in this run:
  ${cli} automations warn --key "<short-id>" --resolve --message "<what recovered>"

  # You cannot do the task at all. Orca marks the run failed with this reason:
  ${cli} automations fail --message "<why the task could not be done>"

  # Only when the task asks for a report. One self-contained .html or .md file:
  # no external fonts, images, styles or scripts; readable on a narrow screen.
  ${cli} automations attach --file "<path>" --title "<title>"
\`\`\`

Do not report command failures you worked around. Attaching a report does not
mark the run successful or clear a warning.

=== TASK ===
`
}

/** Reporting reaches only this host's runtime; WSL and SSH terminals are refused, so they are not told. */
export function automationRunReportingCli(
  target: Extract<AutomationRunTargetResult, { ok: true }>,
  readWslDistro: () => string | undefined
): OrchestrationCliCommand | null {
  if (target.repo.connectionId || isWslUncPath(target.cwd)) {
    return null
  }
  try {
    if (readWslDistro()) {
      return null
    }
  } catch {
    // An unresolved project runtime cannot prove a local host.
    return null
  }
  return localOrchestrationCliCommand()
}

/** The prompt the agent receives; the saved automation prompt never changes. */
export function automationAgentPrompt(prompt: string, cli: OrchestrationCliCommand | null): string {
  return cli ? `${buildAutomationRunPreamble(cli)}${prompt}` : prompt
}
