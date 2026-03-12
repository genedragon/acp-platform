// Revoke IAM permissions at expiration
const { IAMClient, DeleteRolePolicyCommand, GetRoleCommand } = require('@aws-sdk/client-iam');
const { updateRequestStatus, logAudit } = require('./db');
const config = require('./config');

const iamClient = new IAMClient({ region: config.region });

/**
 * Lambda handler for RevokePermissions task
 * Revokes IAM permissions at expiration time
 */
exports.handler = async (event) => {
  console.log('RevokePermissions task started:', JSON.stringify(event, null, 2));

  try {
    const request = event.request || event;
    const granted = event.granted;

    if (!granted || !granted.policy_name) {
      throw new Error('Execution data missing or policy not granted');
    }

    const requestId = request.request_id || request.stored?.request_id || request.execution_arn;
    const principalArn = granted.target_principal || request.requester.identity;
    const policyName = granted.policy_name;

    // Extract role name from ARN
    const roleMatch = principalArn.match(/arn:aws:iam::\d+:role\/(.+)/);
    if (!roleMatch) {
      throw new Error(`Invalid role ARN: ${principalArn}`);
    }
    const roleName = roleMatch[1];

    // Delete inline policy from role
    const deleteCommand = new DeleteRolePolicyCommand({
      RoleName: roleName,
      PolicyName: policyName
    });

    try {
      await iamClient.send(deleteCommand);
    } catch (error) {
      // If policy doesn't exist, that's okay (already deleted)
      if (error.name === 'NoSuchEntityException') {
        console.log('Policy already deleted:', policyName);
      } else {
        throw error;
      }
    }

    // Update request status
    await updateRequestStatus(requestId, 'REVOKED', {
      revoked_at: new Date().toISOString()
    });

    // Log audit entry
    await logAudit({
      request_id: requestId,
      action: 'PERMISSIONS_REVOKED',
      actor: 'system',
      details: {
        policy_name: policyName,
        target_principal: principalArn,
        revoked_at: new Date().toISOString(),
        scheduled_expiration: execution.permission_expires_at
      }
    });

    console.log('Permissions revoked successfully:', policyName);

    return {
      revoked: true,
      policy_name: policyName,
      revoked_at: new Date().toISOString(),
      target_principal: principalArn
    };

  } catch (error) {
    console.error('Error revoking permissions:', error);
    
    // Log failure
    if (event.request_id || event.execution_arn) {
      await logAudit({
        request_id: event.request_id || event.execution_arn,
        action: 'REVOKE_FAILED',
        actor: 'system',
        details: {
          error: error.message,
          stack: error.stack
        }
      });
    }
    
    throw error;
  }
};
