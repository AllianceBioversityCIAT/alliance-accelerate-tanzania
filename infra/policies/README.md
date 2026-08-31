# infra/policies/ — IAM policies for people, not for the application

The application's own permissions live in its SAM templates (`infra/20-backend/template.yaml`
grants the Lambda role). **This directory holds policies to attach to a developer**, and exists
because "what access do I need?" kept being answered from memory.

## `developer-local-test-policy.json`

The **minimum** to run the backend **locally** against real AWS and actually deliver a
contact-form email. It grants **no deploy rights**: no CloudFormation writes, no Lambda, no
RDS, no S3, no IAM, no ability to create, modify or delete a user.

Before attaching, replace `ACCOUNT_ID`, and `USER_POOL_ID` with the pool this environment uses.
Region is `eu-west-1` throughout (`infra/samconfig.toml`).

| Sid | Why it is needed |
|---|---|
| `SendThroughTheVerifiedRegistrySender` | `ses:SendEmail` is what `SesMailTransport` calls — `backend/src/mail/ses-mail.transport.ts` uses `@aws-sdk/client-ses`'s `SendEmailCommand`, which is **SES v1**, not v2. Scoped to the sender identity; recipients are not part of this resource. |
| `VerifyRecipientsWhileInSandbox` | In sandbox SES delivers **only to verified addresses** (README §6, DEP-2). Each administrator address is verified individually and each owner clicks their own link. Needed until AWS grants production access. |
| `ReadSendingStatus` | Answers "are we still in sandbox?" and "what is the quota?" instead of guessing. |
| `ResolveContactRecipientsFromAdminGroup` | `AdminRecipientResolver` lists the `admin` group live — the same grant the Lambda role gets in `20-backend/template.yaml`. Read-only. |
| `ReadStackOutputsAndCallerIdentity` | Read-only. `DescribeStacks` is how the user-pool id and API URL are looked up rather than pasted by hand; `GetCallerIdentity` confirms the profile resolves. |

### What this policy deliberately does NOT cover

Deploying. That needs create/delete across CloudFormation, Lambda, API Gateway, RDS, Cognito,
S3, CloudFront, Secrets Manager **and IAM** (SAM creates the function's execution role, so it
needs `iam:CreateRole`, `iam:AttachRolePolicy` and `iam:PassRole`) — see README §2. Do not try
to reconstruct that as a hand-written policy: ask the account administrator for the existing
deploy role, or for `PowerUserAccess` plus the scoped IAM permissions SAM requires. A
hand-enumerated deploy policy fails halfway through a stack and leaves it in `ROLLBACK` state.

### Reminder — none of this is needed for ordinary local development

`MAIL_TRANSPORT=no-op` plus a local MySQL runs the whole application, including the contact
form, with **no AWS account at all**. See `docs/infrastructure.md` §6 and `backend/.env.example`.
This policy is only for the one thing that genuinely requires AWS: real email delivery.
