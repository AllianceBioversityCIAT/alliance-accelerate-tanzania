# `infra/jenkins/` — advisory patch for the Jenkins administrator

**Status: advisory only. Nothing here is applied by this repository, and
nothing here is applied to the live pipeline by this change.** The
`Jenkinsfile` is not versioned in this repository (`docs/infrastructure.md`
§3, OQ-INFRA-5) — it lives on `automation.prms.cgiar.org`, editable only by
the Jenkins administrator. `bugfix/deploy-script-guardrails` cannot land this
fix; it can only hand it over.

## What `deploy-backend-cors.patch` does

Patches the `Deploy Backend` stage's `ALLOWED_ORIGIN` resolution — **CORS
origin resolution only** — to stop conflating "the frontend stack does not
exist yet" with "the `describe-stacks` call failed." Today, both cases yield
an empty string and both fall back to a permissive `AllowedOrigin=*` on the
live backend (`docs/infrastructure.md` §3). The patch applies the same
two-token classification (`ValidationError` **and** `does not exist`) that
`infra/scripts/_guard.sh`'s `resolve_stack_value` already uses for the
equivalent case in `deploy.sh` and `set-cors.sh` — genuine absence still
bootstraps `'*'` and announces it; any other failure (expired token,
throttle, IAM denial, a malformed stack name) now **aborts the stage**
instead of silently deploying an open CORS policy.

**Verified true as of 2026-09-18**, against the operator-supplied
`Jenkinsfile` copy read that day (quoted verbatim in
`docs/specs/bugfix/deploy-script-guardrails/design.md` §7.4). The
`Jenkinsfile` is not versioned here and can change on the server with no
signal to this repository — treat the patch as stale the moment it no longer
applies cleanly, and re-derive it from a fresh read rather than forcing it.

## What it deliberately does NOT do

The `Deploy Backend` stage's `sam deploy` call carries a **second**,
independent defect: it never passes `MailTransport`, so SAM resubmits
`UsePreviousValue` against a template that (as of PR #75, merged) may no
longer accept the live stack's current value. **This patch does not touch
that.** It was raised separately with the Jenkins administrator by the
product owner, and is documented, not patched, in
`docs/specs/bugfix/deploy-script-guardrails/design.md` §7.4 and
`proposal.md` §4.6. Bundling the two would hand the administrator a diff
mixing a defect they have already actioned with one they have not.

This patch also does not resolve, or assert an answer to, whether `Smoke`
can run between `Deploy Backend` and `Lock CORS` on the bootstrap path
(`DEPLOY_INFRA=true`) — see `docs/infrastructure.md` **OQ-INFRA-6**. That
question needs the pipeline's own stage ordering, which this patch does not
change and this repository cannot read.

## Applying it

1. Confirm the current `Deploy Backend` stage still matches the "before"
   block in `deploy-backend-cors.patch` — line numbers will not match a live
   `Jenkinsfile` and are not meant to; match on content.
2. Apply the "after" block in its place. `FRONTEND_STACK` and
   `AWS_DEFAULT_REGION` are pre-existing stage variables — nothing about
   their resolution changes.
3. No other stage changes. `Lock CORS` and its `when DEPLOY_INFRA == 'true'`
   gate are untouched.
4. This repository has no way to test a `Jenkinsfile` change — verify on the
   Jenkins server's own terms (a dry run or a bootstrap-path build) before
   trusting it in production.
