# Additional Updates Summary

**Date:** 2026-02-22 20:48-20:52 EST  
**Related to:** .waitForTaskToken migration

## Changes Made

### 1. JWT Expiration: 30 min → 60 min

**Files Updated:**
- `docs/architecture.md` - Security Model, Section 1
- `plans/implementation-plan.md` - Phase 2.1

**Change:**
```diff
- JWT expiration (30 min) limits exposure window
+ JWT expiration (60 min) limits exposure window
```

**Rationale:**
- More time for approvers to review requests
- Reduces risk of link expiration during review
- Still short enough for security (1 hour max)
- Configurable via `expiryMinutes` parameter

---

### 2. Explicit IAM Permissions Added

**Location:** `docs/architecture.md` - Security Model

#### New Section 4: IAM Permissions for GrantPermissions Lambda

**Key Features:**
- Only `pvm-request-*` policies can be created
- Only `agent-*` roles can be modified
- Explicit Deny on all other IAM resources
- Condition on `iam:PolicyArn` to enforce naming
- Condition on `aws:RequestedRegion` for region-scoping

**Permissions:**
- `iam:CreatePolicy`, `iam:CreatePolicyVersion` (policies only)
- `iam:PutRolePolicy`, `iam:AttachRolePolicy` (roles only)
- `iam:GetPolicy`, `iam:GetRole` (read operations)

#### New Section 5: IAM Permissions for RevokePermissions Lambda

**Key Features:**
- Mirror of grant permissions for cleanup
- Only `pvm-request-*` policies can be deleted
- Only `agent-*` roles can have policies detached
- Handles `NoSuchEntityException` gracefully (idempotent)

**Permissions:**
- `iam:DeletePolicy`, `iam:DeletePolicyVersion`
- `iam:DeleteRolePolicy`, `iam:DetachRolePolicy`
- `iam:GetPolicy`, `iam:GetRole`

#### New Section 6: Permission Allowlist Enforcement

**Multi-layer validation:**
1. **API Validation** - Reject bad requests before execution starts
2. **Runtime Validation** - Re-check in GrantPermissions task
3. **IAM Constraints** - Lambda role enforces limits

**Defense-in-depth:** Even if allowlist is bypassed, IAM prevents escalation.

---

### 3. Implementation Plan Updates

**Location:** `plans/implementation-plan.md` - Phase 3.7

**Changes:**
- Split generic `pvm-executor-role` into two specific roles:
  - `pvm-grant-executor-role` (for GrantPermissions Lambda)
  - `pvm-revoke-executor-role` (for RevokePermissions Lambda)
- Added complete JSON policy documents for both roles
- Added security constraints documentation
- Added testing requirements for least-privilege verification

---

## Benefits

### Security
✅ **No Ambiguity** - Exact policies provided, not generic descriptions  
✅ **Privilege Escalation Prevention** - Multiple enforcement layers  
✅ **Audit-Friendly** - Naming convention enforces traceability  
✅ **Least-Privilege** - Only minimum required permissions  

### Implementation
✅ **Copy-Paste Ready** - JSON policies can be used directly  
✅ **Clear Constraints** - Security boundaries explicitly documented  
✅ **Testing Guidance** - Verification steps included  

### User Experience
✅ **More Time to Review** - 60-minute JWT expiration  
✅ **Less Pressure** - Approvers won't rush due to tight expiry  

---

## Files Modified

1. ✅ `docs/architecture.md` - 3 new security sections, JWT expiry update
2. ✅ `plans/implementation-plan.md` - IAM role split, policies added, JWT note
3. ✅ `docs/architecture.html` - Regenerated with all changes

---

## Verification

- ✅ JWT expiry consistently 60 minutes across all docs
- ✅ IAM policies include all required actions
- ✅ Resource constraints properly enforced
- ✅ Condition clauses correct (StringLike, StringEquals)
- ✅ Explicit Deny statements included
- ✅ Both grant and revoke roles documented
- ✅ HTML matches markdown

---

## Implementation Checklist

When implementing, ensure:

- [ ] JWT signing uses 60-minute default (configurable)
- [ ] GrantPermissions Lambda uses `pvm-grant-executor-role` with exact policy
- [ ] RevokePermissions Lambda uses `pvm-revoke-executor-role` with exact policy
- [ ] Test that policies outside `pvm-request-*` cannot be created
- [ ] Test that roles outside `agent-*` cannot be modified
- [ ] Test that explicit Deny prevents other IAM operations
- [ ] Verify NoSuchEntityException handling in revoke logic

---

**Status:** ✅ COMPLETE  
**Risk:** NONE (improvements only, no breaking changes)  
**Security Impact:** HIGH (explicit constraints prevent escalation)
