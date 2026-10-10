# cPanel Deployment Guide

This guide describes a repeatable process for configuring, building, deploying, verifying, and rolling back the ET Professionals Network application on cPanel/CloudLinux hosting. It is intended to remain useful across releases; use the current branch, package manifests, and cPanel settings rather than relying on a particular commit or build ID.

## 1. Understand the application layout

This repository contains a root Node.js application and a Next.js frontend workspace:

- Repository root: contains workspace configuration, backend/API code, database migrations, and tests.
- `web/`: Next.js frontend source.
- `web/.next/`: generated production build; do not edit manually.
- cPanel Node.js application root: the directory configured in **Setup Node.js App**.
- cPanel Node environment: the environment created for that specific application.

The frontend and API may be hosted on separate subdomains and use separate application roots. Verify the document root, application root, startup file, Node.js version, and environment variables for **each hostname** in cPanel before deploying. Do not copy a frontend build into an API directory unless that application is explicitly intended to serve the Next.js frontend.

## 2. Prerequisites

Before deploying, confirm:

- Access to the intended Git branch and repository.
- The correct cPanel domain/subdomain and Node.js application.
- A supported Node.js version compatible with the repository's `engines` and dependency requirements.
- Required environment variables are configured in cPanel or in a protected environment file.
- The database and API configuration are known, but secrets are not included in Git.
- There is enough disk space for a backup, installed dependencies, and the new build.

Record the current deployment directory, startup file, Node.js version, and rollback location in your release notes.

## 3. Inspect the repository before changing it

From the repository checkout:

```bash
cd /path/to/ET-Professionals-Network || exit 1

git status --short
git branch --show-current
git log -1 --oneline
git fetch origin
git status -sb
```

Review local modifications and branch differences before updating. Preserve work in progress and recovery points. Do not use `git reset --hard`, `git clean -fd`, or discard stashes as routine deployment steps.

Inspect the root and frontend package manifests to confirm workspace names and available scripts:

```bash
cat package.json
cat web/package.json
```

## 4. Configure the cPanel Node.js application

In cPanel, open **Setup Node.js App** and configure the frontend application:

1. Select a Node.js version supported by the project.
2. Set the application root to the intended frontend deployment directory.
3. Set the production environment.
4. Configure the startup file expected by the deployment (for example, `server.js` if the application uses a custom Next.js server).
5. Configure required environment variables.
6. Note the Node environment path cPanel provides for this application.
7. Save the configuration and use the interface to restart the application after deployment.

The repository root and the frontend directory are not interchangeable. This project defines the frontend as the `web` workspace and the root build script as `web:build`. Use the package script rather than assuming a globally installed `next` command.

If the API runs as a separate Node.js application, configure and maintain it separately with its own startup file, environment, dependencies, logs, and rollback plan.

## 5. Install or verify dependencies

Activate the Node environment associated with the **application being built or run**. Use the activation path shown by cPanel; for example:

```bash
source /home/CPANEL_USER/nodevenv/APP_ROOT/22/bin/activate
node --version
npm --version
```

Replace the example path with the actual path from cPanel. Do not assume that dependencies installed in the source checkout's Node environment are available in the deployed application's environment.

For a workspace repository, install dependencies according to the repository's lockfile and documented package-manager workflow. Prefer reproducible lockfile-based installs (such as `npm ci`) when a compatible lockfile is committed and the installation layout is appropriate for the hosting setup. Do not create or replace lockfiles as an incidental part of a production deploy.

Check dependency resolution from the intended application directory:

```bash
cd /path/to/frontend-deployment || exit 1
node -p 'require.resolve("next")'
node -p 'require("next/package.json").version'
```

If resolution fails, inspect the Node environment, application root, symlink, package manifests, and installation logs before reinstalling anything.

## 6. Build the frontend

Build from the repository checkout, not from the live deployment directory:

```bash
cd /path/to/ET-Professionals-Network || exit 1
source /path/to/source-node-environment/bin/activate
export NEXT_TELEMETRY_DISABLED=1
npm run web:build
```

Use the actual environment path and the build script currently defined in the root `package.json`.

### Shared-hosting resource limits

On hosts with strict process limits, Next.js may fail with errors such as `spawn EAGAIN` or `kill EPERM`. First inspect the complete build log and the hosting limits. If the project supports limiting build concurrency, configure it in the Next.js configuration (for example, `experimental.cpus: 1` for applicable Next.js versions).

The following limits were useful in a constrained Linux hosting environment; they are optional, environment-specific mitigations, not universal requirements:

```bash
export NEXT_PRIVATE_BUILD_WORKER=1
export RAYON_NUM_THREADS=1
export JOBS=1
export MAKEFLAGS="-j1"
export NODE_OPTIONS="--max-old-space-size=2048"
```

If CPU affinity restrictions are necessary, use `taskset` only when the host provides it and the selected CPU is permitted. Do not keep retrying a failed build without inspecting the first meaningful error.

A deployment must not proceed unless the production build completes successfully.

## 7. Validate the generated build

Check that a build ID exists:

```bash
SRC="/path/to/ET-Professionals-Network/web"
test -s "$SRC/.next/BUILD_ID" || {
  echo "ERROR: production build is missing"
  exit 1
}
cat "$SRC/.next/BUILD_ID"
```

Check the expected compiled routes and manifests. Adjust route paths as the application evolves:

```bash
for file in \
  "$SRC/.next/server/app/page.js" \
  "$SRC/.next/server/app/login/page.js" \
  "$SRC/.next/server/app/apply/job/page.js"
do
  if test -s "$file"; then
    echo "OK: $file"
  else
    echo "MISSING: $file"
    exit 1
  fi
done

test -s "$SRC/.next/routes-manifest.json"
test -s "$SRC/.next/server/app-paths-manifest.json"
```

A compiled file check is only a basic sanity check. It does not replace automated tests or runtime testing.

## 8. Back up the current deployment

Set the correct deployment directory explicitly. Verify it before proceeding:

```bash
set -eu
DEPLOY="/path/to/frontend-deployment"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="/path/to/private-backups/frontend-$STAMP"

test -d "$DEPLOY"
mkdir -p "$(dirname "$BACKUP")"
mkdir -m 700 "$BACKUP"
cp -a "$DEPLOY/." "$BACKUP/"
chmod -R go-rwx "$BACKUP"

printf 'Backup created: %s\n' "$BACKUP"
```

Backups may contain credentials and user data. Store them outside public document roots, restrict access, and follow the site's retention policy. Confirm that the backup has enough disk space and includes all files needed for recovery.

## 9. Deploy the built frontend

Only synchronize to the verified frontend application root. Preserve production-specific files such as environment configuration, the startup file, and the dependency installation when they are managed separately from the source workspace.

Example, after replacing the paths with the verified locations:

```bash
set -eu
SRC="/path/to/ET-Professionals-Network/web"
DEPLOY="/path/to/frontend-deployment"

test -s "$SRC/.next/BUILD_ID"
test -f "$DEPLOY/server.js"
test -L "$DEPLOY/node_modules"

rsync -a --delete \
  --exclude='/.env*' \
  --exclude='/node_modules' \
  --exclude='/server.js' \
  --exclude='/tmp/' \
  --exclude='/stderr*.log' \
  "$SRC/" "$DEPLOY/"
```

Important:

- Review the source and destination before running `rsync --delete`. That option removes destination files absent from the source, except excluded paths.
- If the deployed startup file is intentionally different from the source file, keep it excluded and validate it separately.
- If dependencies are not managed by a symlink or separate cPanel environment, adjust the procedure to match the actual installation.
- Never include production secrets in the source workspace.
- Do not use this frontend synchronization command against a separate backend/API root.
- For zero- or low-downtime releases, use a tested staging-directory and swap procedure appropriate to the host. Avoid replacing the active build while requests are being served if the platform cannot guarantee an atomic switch.

## 10. Validate files and restart the application

Compare source and deployed build IDs:

```bash
SRC="/path/to/ET-Professionals-Network/web"
DEPLOY="/path/to/frontend-deployment"

printf 'Source build: '
cat "$SRC/.next/BUILD_ID"
printf 'Deployed build: '
cat "$DEPLOY/.next/BUILD_ID"

node --check "$DEPLOY/server.js"
```

Activate the deployment's Node environment and verify that Next.js resolves from the deployment root:

```bash
source /path/to/deployment-node-environment/bin/activate
cd /path/to/frontend-deployment || exit 1
node -p 'require.resolve("next")'
node -p 'require("next/package.json").version'
```

Restart the correct application in cPanel's **Setup Node.js App** interface. Check the newest application logs after restart. A historical error in an old log is not proof of a current failure; compare timestamps and reproduce the problem before changing dependencies or configuration.

## 11. Smoke-test the public application

Use the actual public frontend URL:

```bash
DOMAIN="https://your-frontend.example.com"

for path in / /login /apply/job; do
  printf '%-18s ' "$path"
  curl -sS -o /dev/null --max-time 25 \
    -w 'HTTP %{http_code}\n' "$DOMAIN$path" ||
    echo "Request failed"
done
```

Add other important routes for the project, including protected routes, with the understanding that a protected page may redirect or require a session.

Check response headers and browser behavior as well. HTTP 200 alone does not prove that client-side JavaScript, authentication, forms, API requests, or database operations are working.

After deployment:

1. Open a private/incognito browser window and hard-refresh.
2. Check browser Console and Network panels.
3. Test navigation and authentication.
4. Test form validation with invalid input and confirm errors are user-friendly.
5. Test an authorized successful workflow.
6. Verify requests reach the expected API host and that API responses are handled correctly.
7. Inspect new server logs for errors generated during these tests.

## 12. Frontend/API separation

When the frontend and API use separate subdomains:

- Verify DNS, HTTPS, cPanel document roots, and Node.js application roots for both.
- Configure the frontend's API base URL through the intended environment/configuration mechanism.
- Verify CORS policy when browser requests cross origins.
- Confirm API routes and health checks independently of frontend routes.
- Keep backend dependencies, startup files, secrets, logs, and backups separate.
- Remember that public Next.js environment variables may be embedded into browser assets during the build. Changing a public API URL can require rebuilding and redeploying the frontend.
- Do not expose credentials in client-side variables. Only non-secret values intended for browsers belong in public configuration.

## 13. Troubleshooting

| Symptom | Checks |
|---|---|
| `next: command not found` | Verify the package script, active Node environment, and workspace dependencies. |
| `Cannot find module 'next'` | Resolve Next.js from the real deployment directory under the cPanel runtime; inspect the environment and dependency link. |
| `spawn EAGAIN` or `kill EPERM` during build | Inspect resource limits and build logs; consider supported worker-concurrency limits. |
| Server Action not found | Hard-refresh, inspect newly generated requests and logs, compare active build IDs, and check for inconsistent instances or cached assets. |
| HTTP success but browser error | Inspect Console, Network, client-side code, and API responses. |
| Form exposes internal errors | Improve client and server validation and map known failures to safe, actionable messages. |
| Frontend cannot reach API | Verify configured API URL, HTTPS, DNS, CORS, endpoint paths, and API health. |
| Missing environment variables | Check cPanel variables and the actual environment-file loading path without printing secrets. |
| New build not visible | Confirm the domain root, deployed build ID, referenced static assets, cache behavior, and correct application restart. |

## 14. Rollback

If validation fails:

1. Stop further deployment changes and capture the current error.
2. Identify the exact pre-deployment backup.
3. Verify that the backup contains the previous working build, startup file, and required configuration.
4. Back up the failed deployment separately if practical.
5. Restore the selected backup into the same verified application root, preserving ownership and permissions.
6. Restart the correct cPanel application.
7. Repeat HTTP, browser, API, and log checks.
8. Retain the backup until the recovered application passes functional verification.

A frontend rollback does not automatically reverse backend releases or database migrations. Assess those changes separately and use a tested database recovery procedure when necessary.

## 15. Release checklist

- [ ] Correct branch and commit reviewed.
- [ ] Local work and recovery points preserved.
- [ ] Frontend and API application roots verified independently.
- [ ] Correct Node.js runtime selected.
- [ ] Dependencies resolve in the intended environment.
- [ ] Production build completes successfully.
- [ ] Required route files and manifests checked.
- [ ] Current deployment backed up securely.
- [ ] Build synchronized to the correct frontend root.
- [ ] Environment configuration and custom startup file preserved.
- [ ] Deployed build ID matches the intended source build.
- [ ] Correct cPanel application restarted.
- [ ] Public smoke tests pass.
- [ ] Browser Console and Network checks pass.
- [ ] Authentication, forms, and key user workflows tested.
- [ ] Frontend-to-API communication verified.
- [ ] New server logs reviewed.
- [ ] Rollback backup retained until acceptance.

## 16. Release record template

Record these values for each release without recording secrets:

- Deployment date/time:
- Git branch and commit:
- Frontend build ID:
- Frontend application root:
- API application root (if applicable):
- Node.js version:
- Backup location:
- cPanel application restarted:
- HTTP smoke-test results:
- Browser and workflow test results:
- Outstanding issues:
- Rollback required:

---

**Principle:** Build from a reviewed source revision, deploy only to the verified application root, preserve production configuration, verify the live build, test real user workflows, and retain a known-good rollback path.
