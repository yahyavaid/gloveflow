# Deployment review — not yet executed

Target: **GloveFlow invited-testers backend**, stack `gloveflow-cloud`, AWS project accessed through profile `yahya-portfolio`, region **us-east-2**. The profile name is a local configuration name, not a credential. No credentials were accessed while authoring this project, and no cloud resources were created.

## Proposed resource changes

| Resource | Purpose and defaults |
| --- | --- |
| HTTP API, default stage, JWT authorizer, three routes/integrations | Cognito access-token scope required; exact-origin CORS; throttle 2 requests/second and burst 5. |
| One Python 3.12 ARM64 Lambda | 128 MB, 10-second timeout; fixed-schema input, ownership checks, bounded responses. |
| One DynamoDB table | On-demand capacity, encryption, per-subject partition; no scans or secondary indexes. Retained on stack deletion. |
| Cognito Lite pool, public app client, domain, custom scope | Invited testers only; email sign-in; mandatory authenticator-app TOTP; code flow; 15-minute access tokens; one-day refresh tokens with rotation. Pool retained on deletion. |
| One Lambda execution role and API invoke permissions | Only this table's GetItem/PutItem/Query/DeleteItem and this function's log writes. No administrator policy. |
| Two CloudWatch log groups | Seven-day retention; request metadata and error class only, no request bodies or JWTs. |
| SAM artifact storage | `resolve_s3` can create/use a SAM-managed S3 artifact bucket and helper stack. Review that additional storage before packaging. |

There are ten explicit template resources; SAM expands API routes and permissions into additional CloudFormation resources. No EC2, NAT gateway, containers, Bedrock/model calls, provisioned database, or custom domain is proposed.

## Costs and project access to check first

Deployment would start metered services: HTTP API requests, Lambda execution, DynamoDB requests/storage, Cognito usage, log ingestion/storage, and SAM artifact storage. Free-tier eligibility depends on the project's plan and remaining allowance; this source makes no zero-cost guarantee. The configured throttle is best-effort and is not a spending cap. There is no hard user record quota.

Before authorization to deploy, review the project's free/paid plan and service availability in the **new AWS experience**, establish a small portfolio spending limit/budget notification through AWS Settings, and confirm the deployer can create the listed CloudFormation/IAM/Cognito/Lambda/API Gateway/DynamoDB/Logs/S3 resources. Do not grant broad human administrator access simply to make deployment work. None of these checks were performed for this source-only deliverable.

Use current official pricing when estimating the actual intended test volume: [HTTP API](https://aws.amazon.com/api-gateway/pricing/), [Lambda](https://aws.amazon.com/lambda/pricing/), [DynamoDB](https://aws.amazon.com/dynamodb/pricing/on-demand/), [Cognito](https://aws.amazon.com/cognito/pricing/), [CloudWatch](https://aws.amazon.com/cloudwatch/pricing/), and [S3](https://aws.amazon.com/s3/pricing/).

## Values that need a final decision

1. An available `CognitoDomainPrefix` (3–40 lowercase letters, numbers, and hyphens; no trailing hyphen). Domain availability has not been queried.
2. Exact frontend `AllowedOrigin` and `CallbackUrl`. Defaults are `http://localhost:5173` and `http://localhost:5173/callback` for local development. The current GloveFlow website does **not** implement that callback yet. Use the final HTTPS origin when integrating it.
3. The tester group and test protocol. Self-signup is disabled; an authorized project administrator must create/invite testers. Every tester needs an authenticator app. Do not put tester emails or invitation details in Git.

Keep the default stack name, or choose one no longer than 55 characters so the derived Lambda name fits its 64-character limit.

## Local preparation, then a separately authorized deployment

Install/approve the AWS SAM CLI and local validators first. These instructions do not install or run them automatically. A compatible container runtime is needed for the reproducible ARM64 build command below. The Python runtime dependency is pinned in `src/requirements.txt`; it will be downloaded during the build.

From the project root, after tools are available:

```sh
python3 -m unittest discover -s tests -v
cfn-lint --format json --regions us-east-2 --template template.yaml
cfn-guard validate --rules security.guard --data template.yaml --output-format json
sam build --use-container
```

The Guard file checks this source template's selected safeguards, not general compliance certification. Review the expanded template and IAM policy in `.aws-sam/build/template.yaml` as well.

After explicit deployment authorization and the decisions above, prepare a change set. This command uploads code to S3 and creates a change set; **it is already an AWS write** even though it does not execute the application changes:

```sh
sam deploy --profile yahya-portfolio --region us-east-2 \
  --stack-name gloveflow-cloud --capabilities CAPABILITY_IAM \
  --resolve-s3 --no-execute-changeset \
  --parameter-overrides \
    CognitoDomainPrefix=replace-with-your-prefix \
    AllowedOrigin=http://localhost:5173 \
    CallbackUrl=http://localhost:5173/callback
```

Review the actual change-set additions/replacements, permissions, service pre-deployment validation events, resolved region, and retained-data behavior before executing it. Stop on validation errors or unexpected resources. The template contains a us-east-2 assertion and SAM configuration defaults to that region. No change set has been created for this deliverable.

## Browser integration and acceptance after deployment

Implement Cognito authorization-code login using a maintained OAuth client library, S256 PKCE, random `state` verification, and the exact callback URI. Request `openid gloveflow/sessions`. A public browser client has no client secret; none belongs in JavaScript. Avoid implicit flow. Keep access/refresh tokens out of logs, URLs, and persistent browser storage; use the chosen library's secure session design. The template cannot force every browser request to use PKCE, so the client integration must do so.

Add an explicit Save session action after a completed exercise. Measure actual task duration in the browser, let the tester enter observed loss/error counts or leave them unknown, and visibly preserve the simulation label. Only send the seven aggregate fields after the tester chooses to save. Keep camera processing local.

Acceptance requires two separate invited test identities: valid login/TOTP and save/list/delete; anonymous and ID-token requests denied; missing scope denied; Alice cannot list or delete Bob's records; identical retries return one record; changed retries conflict; pagination yields only the current tester's records; allowed-origin preflight works; an unrelated origin cannot read browser responses; no tokens or results appear in logs. Verify the stack's Region output is `us-east-2`. These live checks have not been run.
