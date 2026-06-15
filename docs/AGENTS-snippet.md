# AGENTS.md Snippet

Copy this into a repo that uses `agent-notification-harness`.

```md
## Notifications

Use the agent notification harness for completion messages and media handoff.

For text updates:

\`\`\`bash
npm run agent:notify -- "Short status message"
\`\`\`

For media artifacts, copy small shareable files into:

\`\`\`txt
.agent-notifications/artifacts/<task-slug>-<timestamp>/
\`\`\`

Prefer direct media files in that folder, such as:

- `preview-start.png`
- `preview-mid.png`
- `preview-end.png`
- `rollout.mp4`
- `rollout.gif`

Then run:

\`\`\`bash
npm run agent:notify:media
\`\`\`

Do not place secrets in the artifact folder. Keep `.env.local` and `.agent-notifications/` ignored by git.
```
