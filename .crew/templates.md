# CREW templates

Copy a template, fill the `<...>` fields, and keep the wording. The sentence under each heading says when the pilot uses the template. pattern.md has the full rules, and [GLOSSARY.md](GLOSSARY.md) has the terms.

The inspector has no Write tool, so it returns its findings and the pilot saves them. A [reviewer](GLOSSARY.md) writes its own report to `.crew/rounds/`, like the prober.

## Inspector brief

The pilot sends this when it calls the inspector on a chunk, on a sidecar diff, or on CHECK.

```
Round <n>, inspector, scope <globs>, base <commit>, criterion <plan step completion criterion>, spec <the SPEC line it quotes, or none>.
Repo rules that apply: <paths, e.g. AGENTS.md sections> - quote the rule you cite.
For each finding: file:line, rule or behavior broken, regression (caused by an earlier CREW fix commit) or new defect.
Sibling sweep: grep every other place that states the same claim; list all sites.
A warning or workaround that documents a library trap is a must-fix for the code, not the docs.
Return PASS, or ISSUES with one line per finding (file:line).
```

In a review round, the pilot saves the returned findings to `.crew/rounds/<n>-inspector.md`.

## Reviewer or prober brief

The pilot sends this to a reviewer or the prober in a review round of a LOOP step, and to the reviewer of the final review before "done".

```
Round <n>, role <reviewer|prober>, scope <globs>, base <commit>.
Repo rules that apply: <paths, e.g. AGENTS.md sections> - quote the rule you cite.
Read-only on the repo (prober: write and run only in .crew/scratch/ or a throwaway worktree).
For each finding: file:line, rule or behavior broken, regression (caused by an earlier CREW fix commit) or new defect.
Sibling sweep: grep every other place that states the same claim; list all sites.
A warning or workaround that documents a library trap is a must-fix for the code, not the docs.
Write the full report to .crew/rounds/<n>-<role>.md.
Return max 10 lines: must-fix count, regressions count, new defects count, top must-fix (file:line), report path.
```

## Fix-lane brief

The pilot sends this to a sidecar or a lane that fixes review findings.

```
Fix <findings, by report path + ids>, scope <files or globs>, branch <name> from <commit>.
Repo rules: <paths>. Checks to run before reporting: <list from the repo rules, not from memory>.
1. Add a test that fails without the fix; cite its failing output.
2. Fix; cite the passing output of the same test and of the checks.
3. Sibling sweep: grep every place that states the same claim or pattern; fix in scope or list.
4. No unrequested changes. A needed extra goes in its own commit and is listed under "extras".
5. Library trap found: fix the code with a failing test first; never only document it.
Report max 10 lines: files, commits, test output lines, extras, deviations.
```

## Plan (.crew/plan.md)

The pilot writes this when it drafts the plan; it locks on the user's yes. Each step has one completion criterion and lists the files it touches. If the plan has no risk marker, G1 needs no consult, and the pilot adds the self-check line instead.

```
SPEC: <file, issue, PR or note, or none>
<n>. <step> - files <globs> - criterion <one verifiable condition, quoting the SPEC line> - skills <max 2>
self-check: one criterion per step <yes|no>, order sound <yes|no>, top risks <1>; <2>
```

## State file (.crew/state.md, max 40 lines)

The pilot writes this after the plan locks, after each finished step, and after each sidecar or lane change. If a section grows too long, the pilot moves the detail to a file in `.crew/` and leaves a pointer.

```
TASK: <goal> - success: <criteria>
STATE: <files, branch, commit, tests> - mode <1|2|3>, consult limit <1-5>, max steps <n>, max rounds <n> - top level <target, prepared command>
SIDE: <sidecar and lane entries>
SKILLS: <task -> skill>; preferences <...>; dropped <skill - reason>
PLAN: locked plan in .crew/plan.md, at step <x>/<y> (LOOP step: round <n>/<max>)
OPEN: <failed approaches, blockers, skipped gates, consult log lines, pointer to the last round log line>
DECISIONS: <DECISIONS lines>
NEXT: <ordered steps>
ASK: <one line each>
VERIFY: <how to check that the task is done>
Rule: every claim references a file, commit, or test.
```

## SIDE sidecar entry

The pilot adds this to SIDE when it queues a sidecar, and updates the status at each change.

```
sidecar <task>: agent <sidecar|sidecar-complex|sidecar-lite>, model <model>, files <globs>, status <queued|running|done|issues|verified>, verify <command>
```

## SIDE lane entry

The pilot adds this to SIDE when a lane starts.

```
lane <name>: host <machine>, session <id>, worktree <path>, branch <name>, head <sha>, status <queued|running|done|issues|verified>, files <globs>
```

## Round log line (.crew/rounds/log.md)

The pilot appends this after each review round of a LOOP step.

```
R<n> <date> must-fix <m> (regressions <r>, new <d>) commits <sha,...> report .crew/rounds/<n>-*.md
```

## Consult log line (.crew/state.md OPEN)

The pilot adds the first line after each consult with the advisor. It adds a "skipped" line when the consult limit (1-5) is used up or a consult fails.

```
G<1-4> <n>/<limit>: <short answer>
G<1-4> skipped (cap)
G<1-4> skipped: <reason>
```

## Lesson line (.crew/lessons.md)

The pilot writes this after the user corrects its behavior. A lesson has at most 25 words on exactly one line. A line that replaces a failed lesson ends with ` (2x)`.

```
[YYYY-MM-DD] <pattern> -> <imperative rule>
```

## DECISIONS line

The pilot adds this after each decision of the user.

```
<YYYY-MM-DD> <decision> - scope <what it covers> - by <user>
```

## Prior-art result (in .crew/plan.md next to the step, max 15 lines)

The prior-art scout returns this before a large plan step or a new mechanism.

```
<owner/repo>@<commit> - <licence> - technique: <one line> - copy/avoid: <one line> - idea only: <yes|no>
```

## Done report

The pilot sends this when the DONE-CHECKLIST holds. Review depth: 0 for docs-only changes after green checks, 1 for product code, 2 for a plan with a risk marker.

```
Done: <task>. Checks: <command: summary line>, commit <sha>. Consults <n>/<limit>. Review depth <0|1|2>: <reason>.
```

## Publish command (after DONE-CHECKLIST)

The pilot hands this to the user when the work is ready for the top level.

```
Ready for top level: <target>. Run: <exact command>. Checks: <check output lines, commit>.
```
