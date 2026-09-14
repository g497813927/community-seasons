# Protected QA hosting

[English](QA_HOSTING.md) | [简体中文](QA_HOSTING.zh-CN.md)

Use the separate Vercel project **community-seasons-qa** for temporary remote testing. It serves the [general QA preview](QA.md), with isolated browser saves and Toy cloud access disabled. It does not use Toy, publish the production game, or change any player save keys.

## One-time configuration

Create an empty Vercel project named `community-seasons-qa` in the intended team. Before uploading files, set **Deployment Protection → Vercel Authentication → All Deployments**. The trigger requires the exact project name, project ID, team ID, and `ssoProtection.deploymentType: "all"`; it stops before upload when they do not match. Keep this project separate from public sites and do not connect it to an automatic Git deployment.

Vercel can classify an empty project's first deployment as production even when preview was requested ([upstream issue](https://github.com/vercel/vercel/issues/17069)). The trigger therefore also requires a **READY production bootstrap** in this protected QA project. If one already exists, keep it and skip the following step. Otherwise, use an installed, signed-in Vercel CLI to upload a small placeholder once:

```sh
mkdir -p /tmp/community-seasons-qa-bootstrap
printf '%s\n' '<!doctype html><title>Protected QA hosting</title><p>QA environment initialized.</p>' > /tmp/community-seasons-qa-bootstrap/index.html
vercel link --cwd /tmp/community-seasons-qa-bootstrap
vercel deploy --cwd /tmp/community-seasons-qa-bootstrap --prod
```

During `link`, select the intended team and the **existing `community-seasons-qa` project**. Confirm All Deployments protection is enabled before `deploy`. This single initialization intentionally uses the dedicated QA project's production slot for the placeholder; do not upload game source, secrets, or player data. Wait for READY, verify the URL requires Vercel authentication in a signed-out browser, and retain this bootstrap. The regular trigger requests previews and refuses to share a deployment classified as production.

For local execution, make these environment variables available through your preferred secret manager or terminal environment:

| Variable | Value |
| --- | --- |
| `VERCEL_TOKEN` | An expiring Vercel API token scoped to the team containing the QA project |
| `VERCEL_PROJECT_ID` | The QA project's `prj_…` identifier |
| `VERCEL_ORG_ID` | Its `team_…` identifier |

Vercel access tokens are [scoped to teams](https://vercel.com/kb/guide/how-do-i-use-a-vercel-api-access-token). The script checks the exact QA project, but that check does not restrict the token’s underlying access to other projects in its team.

Never put a token in a command argument, tracked file, screenshot, issue, or PR. The script uses Node's built-in HTTP client; the Vercel CLI is not required. Installing and signing into Vercel CLI is a separate option for managing the account, not a substitute for these explicit deployment variables.

For GitHub Actions, configure an environment named **qa-preview** with deployment branches restricted to **main**. Add `VERCEL_TOKEN` as an environment secret and the two IDs as environment variables. An environment reviewer may be added if your team wants a human deployment gate. The workflow dispatch and deploy script also reject other refs; never change this workflow to run untrusted PR code with deployment credentials.

## Local trigger

Run from the repository root using Node.js 24:

```sh
npm run setup
npx --no-install playwright install chromium webkit
npm run qa:build
npm run qa:all
npm run qa:deploy
```

The last command requires a passing English/Simplified Chinese Web, Android and iOS browser-emulation report whose source and output hashes match the files being uploaded. The build's `qa-build-info.json` must also match the current game, preview sources and root package files. These checks do not prove physical-device behavior. Changing source or rebuilding different output requires a fresh QA run.

The access link lasts **one hour** by default. To request another bounded duration:

```sh
npm run qa:deploy -- --ttl-seconds 7200
```

The repository accepts 60–82,800 seconds, up to 23 hours. It always sends a TTL: omitting TTL from Vercel's share-link API would create a link that never expires.

The trigger uploads only allowlisted files from `qa/preview/dist/` to the explicitly selected project as a preview. It verifies readiness, project identity, preview target and protection again, then requires anonymous access to be denied before requesting a share link. Unexpected API responses stop the run without printing their contents. The inline upload is capped at 4 MiB; exceeding that cap requires reviewing the upload strategy.

## Access and device selection

The terminal prints the protected deployment URL, expiry and a local `access.json` path under `results/qa/vercel-*/`. The file contains the private access URL and has owner-only permissions (`0600`); its directory is Git-ignored. Open that file locally and use the link on the test device. Treat the full URL as a password, and delete the file when testing ends.

The access link establishes Vercel's authentication cookie. After it redirects, use the printed **query-free** deployment URL with the [device inspector](QA.md). Vercel may shorten the project prefix: both `community-seasons-qa-….vercel.app` and `community-seasons-<build>-<team>.vercel.app` are accepted over HTTPS, at `/` or `/index.html`, with no query string. The inspector requires the exact selected URL and target ID, then checks the isolated QA marker and disabled cloud provider. Never pass a `_vercel_share` URL to device commands: commands and reports must not contain the access secret.

Run device inspection from the same source checkout used to build the hosted preview. Device status reports whether the embedded immutable build record matches that checkout; measurement rejects an unbuilt or stale page until you deploy the current build and reload it.

To revoke a link before expiry, use the deployment's **Share** control or the team's Deployment Protection access page. The API also supports revoking a specific share secret without creating a replacement. Do not switch off project protection to make testing easier.

To obtain a fresh one-hour link for an existing preview without rebuilding or uploading again, use its non-secret deployment ID:

```sh
npm run qa:share -- --deployment dpl_YOUR_QA_DEPLOYMENT
```

This command verifies the project, trigger metadata, READY state, preview target, access protection and anonymous denial before issuing the link. It accepts the same optional `--ttl-seconds` setting and writes the URL only to a private local file.

## Manual GitHub trigger

After this workflow is merged, open **Actions → Protected QA preview → Run workflow** and select `main`. The workflow installs locked dependencies, runs the framework tests and all six bilingual browser scenarios, then deploys. Credentials are present only in the deployment step.

CI uses `qa:deploy -- --deploy-only`: it prints the authentication-protected URL and deployment ID without creating an access secret on the runner. Team members can open the protected URL using Vercel Authentication. For a temporary link on a device without Vercel login, run `qa:share` locally with that ID. The Vercel connector's `get_access_to_vercel_url` tool can alternatively issue a 23-hour link privately. Access URLs must never be printed in CI logs, uploaded as workflow artifacts, or posted to PRs.

The trigger never requests promotion or changes project protection. It stops on an unexpected deployment target and creates no share link. Inspect the non-secret deployment ID in Vercel before retrying if an upload's result was uncertain. Keep the protected bootstrap in place so subsequent uploads remain previews.

## API references

- [Vercel Authentication](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication)
- [Link an existing project](https://vercel.com/docs/cli/link) and [deploy the protected bootstrap](https://vercel.com/docs/cli/deploy)
- [Create a deployment](https://vercel.com/docs/rest-api/deployments/create-a-new-deployment): preview target is omitted and represented as `null` in deployment responses; the empty-project exception is handled by the bootstrap guard above.
- [Expiring share links and revocation](https://vercel.com/docs/rest-api/aliases/update-the-protection-bypass-for-a-url)
- [Vercel MCP access tools](https://vercel.com/docs/agent-resources/vercel-mcp/tools)
