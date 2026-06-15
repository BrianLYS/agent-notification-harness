# Adoption Notes

## Start Clean

Use this path for a new repo that does not already have notification conventions.

1. Install the harness:

   ```bash
   npm install --save-dev github:BrianLYS/agent-notification-harness
   ```

2. Add package scripts:

   ```json
   {
     "scripts": {
       "agent:notify": "agent-notify",
       "agent:notify:image": "agent-notify-image",
       "agent:notify:media": "agent-notify-media",
       "agent:notify:stop": "codex-stop-notify"
     }
   }
   ```

3. Add ignored local config:

   ```bash
   cp node_modules/agent-notification-harness/.env.example .env.local
   ```

4. Ignore local state and secrets:

   ```gitignore
   .env.local
   .agent-notifications/
   ```

5. Tell agents to use `.agent-notifications/artifacts/<task-slug>-<timestamp>/` for media they want sent.

## Adopt Halfway

Use this path for an existing repo with its own artifact structure.

1. Install the harness without changing existing output paths:

   ```bash
   npm install --save-dev github:BrianLYS/agent-notification-harness
   ```

2. Configure the media root in `.env.local`:

   ```bash
   AGENT_NOTIFY_MEDIA_ROOT=./artifacts
   ```

3. Run a dry-run against existing artifacts:

   ```bash
   npx agent-notify-media --dry-run
   ```

4. If the existing artifact tree is too noisy, leave `AGENT_NOTIFY_MEDIA_ROOT` unset and ask agents to copy only shareable media into `.agent-notifications/artifacts/`.

## Repo Instruction Strategy

Prefer an `AGENTS.md` snippet first. It is visible to agents working inside the repo and can include project-specific expectations.

A reusable Codex skill makes sense later if the workflow grows provider-specific behavior, richer manifests, or non-Node setup logic.
