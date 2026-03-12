# SSM Parameter Setup for PVM

## Create the Permission Allowlist Parameter

The permission allowlist has been centralized to AWS Systems Manager Parameter Store.

### Create the Parameter

Run this command to create the SSM parameter:

```bash
aws ssm put-parameter \
  --name "/pvm/permission-allowlist" \
  --type "String" \
  --value '{
  "allowedActions": [
    "s3:GetObject",
    "s3:PutObject",
    "s3:ListBucket",
    "dynamodb:GetItem",
    "dynamodb:PutItem",
    "dynamodb:Query",
    "dynamodb:Scan",
    "dynamodb:UpdateItem",
    "dynamodb:DeleteItem",
    "lambda:InvokeFunction"
  ],
  "deniedActions": [
    "iam:*",
    "*:*",
    "organizations:*",
    "account:*"
  ],
  "description": "Allowlist for PVM - approved IAM actions that can be granted"
}' \
  --description "Permission allowlist for Permissions Vending Machine" \
  --region us-west-2
```

### Update the Parameter

To update the allowlist later:

```bash
aws ssm put-parameter \
  --name "/pvm/permission-allowlist" \
  --type "String" \
  --value '{...}' \
  --overwrite \
  --region us-west-2
```

### Verify the Parameter

```bash
aws ssm get-parameter \
  --name "/pvm/permission-allowlist" \
  --region us-west-2
```

## Required IAM Permissions

All Lambda functions need this permission added to their execution roles. See `iam-policy-ssm-access.json` for the policy document.

## Notes

- The allowlist is cached in Lambda memory for 5 minutes to reduce SSM API calls
- If SSM is unavailable, Lambda falls back to safe defaults (s3:GetObject, s3:ListBucket only)
- Added DynamoDB actions: Scan, UpdateItem, DeleteItem (in addition to existing GetItem, PutItem, Query)
