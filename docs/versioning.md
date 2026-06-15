# Versioning

This project uses SemVer for GitHub-tagged installs.

## Current Stability

Before `1.0.0`, minor versions may adjust CLI behavior, environment variables, or file layout. Patch versions should stay compatible within the same minor line.

After `1.0.0`:

- Patch versions are bug fixes only.
- Minor versions may add commands, flags, providers, or optional files.
- Major versions may change CLI names, environment variables, queue formats, or default artifact layout.

## Install By Version

Pin a GitHub tag for repeatable installs:

```bash
npm install --save-dev github:BrianLYS/agent-notification-harness#v0.2.0
```

Use the default branch only when you want the latest development state:

```bash
npm install --save-dev github:BrianLYS/agent-notification-harness
```

## Release Checklist

1. Choose the next version.

   ```bash
   npm run version:patch
   npm run version:minor
   npm run version:major
   ```

2. Update `CHANGELOG.md`.

3. Run release checks:

   ```bash
   npm run release:check
   ```

4. Commit the version and changelog:

   ```bash
   git add package.json package-lock.json CHANGELOG.md
   git commit -m "Release vX.Y.Z"
   ```

5. Create and push an annotated tag:

   ```bash
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push
   git push origin vX.Y.Z
   ```

## `1.0.0` Gate

Cut `1.0.0` when the GitHub install path, initializer, Telegram provider behavior, default artifact handoff, and installed-package tests have survived external use without interface churn.
