# webrtc-issue-detector

## One task and durable handoff

Keep the original agreed task key across agents, chats, stages, checkouts, retries and PRs.
Do not automatically create subtasks, duplicate tasks or GitHub Issues for internal steps;
a separate card requires an explicit human instruction. Internal subagent assignments are fine.
Preserve existing subtasks, links, history and reporting. Meaningful multiple PRs in the same or
other repositories are allowed; one PR is enough for a simple task. Each PR states the shared key,
its part, dependencies, checks and remaining work.

Before resuming, read the current task, checkpoint/plan and every PR; verify current SHA values,
checks, delivery and ownership. An active other executor or unclear handoff requires a transfer:
do not start competing work or overwrite their status/control fields. This policy does not authorize
another autonomous run. Keep this project's status routes and merge/deploy permissions.

After significant stages, decisions, checks (including failures), merges, delivery or blockers,
and before handoff/session end, update a compact checkpoint in the original task with accessible links:

- goal and boundaries; stable criterion ID → current status → covering PR → exact checked revision and evidence;
- decisions, human answers and the product-question round already used;
- completed work, remaining plan and dependencies;
- all repositories, PRs, branches, exact head/base/merge SHA values; actual delivery state and exact delivered revisions distinct from merge SHA;
- checks and evidence with exact CI/review SHA values, and explicitly unverified conditions;
- blockers, executor state (active / completed / awaiting transfer), the next concrete step and its owner; unsaved/unpublished changes and paths.

Read current state before each write; preserve others' decisions, PRs and results. Edit only your
own summary; supplement another author's summary with a link. Repeating an event creates no duplicates:
match task, repository/PR, exact revision and fact. After a timeout, read before retrying; read back successful writes.
A chat, local file or deletable branch cannot be the only context source. If Jira/the tracker is down,
save the prepared checkpoint in an accepted durable published plan/PR/commit, mark it unsynchronized,
then reconcile and sync when access returns. If no such source is available, a local copy is only
an emergency draft and a handoff blocker, not successful persistence.

The next agent recovers completed work, exact commits, unverified criteria and the next step.
Keep accepted decisions and the used question round; do not repeat accepted product questions.
Resolve technical questions within the work.
Record a new substantial product contradiction as a blocker while preserving completed work.
The first merge, component release or agent finishing does not complete the task: aggregate acceptance
covers all criteria, required PRs, dependencies and delivery. Partial PRs may be reviewed and merged
within existing permissions. Retain closed-unmerged/replaced PR history without counting it as delivery.
After base/head or dependent PR changes, repeat affected combined-result checks on exact new revisions.
The latest PR's outcome must not overwrite the aggregate result.
