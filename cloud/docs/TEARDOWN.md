# Teardown

Nothing has been deployed by this project yet. The commands below describe a future cleanup after a separately authorized deployment.

The template intentionally retains `SessionTable` and `UserPool` on stack deletion or replacement. This protects saved results and tester identities, but it means **deleting the stack is not a complete cleanup**. Retained DynamoDB storage can continue to incur charges. Retained older replacements, if any, also need review.

Before deleting a deployed stack, save its `SessionTableName` and `UserPoolId` outputs privately, confirm the correct project and us-east-2, and decide whether any real aggregate results need export. Exports must not be committed to the public repository. Obtain explicit authorization before permanently deleting data or identities.

With that authorization, remove the application stack through SAM:

```sh
sam delete --stack-name gloveflow-cloud --profile yahya-portfolio --region us-east-2
```

Review SAM's prompts. This removes the API, function, execution role, app client, hosted-login domain, scope resource, and log groups. The table and user pool remain because of their retention policies. Existing tokens cannot call the deleted API.

For complete deletion, use the exact retained identifiers recorded above and remove the retained DynamoDB table and Cognito user pool in their us-east-2 consoles, after checking that neither is shared or needed. Those deletions are permanent. Do not delete a SAM-managed artifact bucket or helper stack if other projects use it; remove only this application's unused artifacts, then verify whether the helper resources are still required.

Finally, verify that no GloveFlow API/function, table, user pool, replaced retained resources, log groups, or unused application artifacts remain. Review the billing view afterward because usage reporting can lag. Remove obsolete frontend environment references and sign-in sessions. A teardown is complete only after this inventory check, not merely when the CloudFormation stack disappears.
