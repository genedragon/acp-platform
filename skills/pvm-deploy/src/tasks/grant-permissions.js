// Grant IAM permissions
const { IAMClient, PutRolePolicyCommand, GetRoleCommand } = require('@aws-sdk/client-iam');
const { updateRequestStatus, logAudit } = require('./db');
const config = require('./config');

const iamClient = new IAMClient({ region: config.region });

/**
 * Lambda handler for GrantPermissions task
 * Grants IAM permissions and calculates expiration timestamp
 */
exports.handler = async (event) => {
  console.log('GrantPermissions task started:', JSON.stringify(event, null, 2));

  try {
    const request = event.request || event;
    const approval = event.approval;

    if (!approval || !approval.approved) {
      throw new Error('Request not approved');
    }

    const requestId = request.request_id || request.stored?.request_id || request.execution_arn;
    const principalArn = request.requester.identity;
    const expirationMinutes = request.expiration_minutes || 60;

    // Extract role name from ARN
    const roleMatch = principalArn.match(/arn:aws:iam::\d+:role\/(.+)/);
    if (!roleMatch) {
      throw new Error(`Invalid role ARN: ${principalArn}`);
    }
    const roleName = roleMatch[1];

    // Verify role exists
    await verifyRole(roleName);

    // Build policy document
    const policyDocument = buildPolicyDocument(request.permissions_requested);

    // Generate policy name
    const executionId = requestId.split(':').pop().substring(0, 16);
    const policyName = `pvm-request-${executionId}`;

    // Attach inline policy to role
    const putPolicyCommand = new PutRolePolicyCommand({
      RoleName: roleName,
      PolicyName: policyName,
      PolicyDocument: JSON.stringify(policyDocument)
    });

    await iamClient.send(putPolicyCommand);

    // Calculate expiration timestamp
    const grantedAt = new Date();
    const expiresAt = new Date(grantedAt.getTime() + expirationMinutes * 60 * 1000);

    // Update request status
    await updateRequestStatus(requestId, 'ACTIVE', {
      policy_name: policyName,
      granted_at: grantedAt.toISOString(),
      permission_expires_at: expiresAt.toISOString(),
      target_principal: principalArn
    });

    // Log audit entry
    await logAudit({
      request_id: requestId,
      action: 'PERMISSIONS_GRANTED',
      actor: 'system',
      details: {
        policy_name: policyName,
        target_principal: principalArn,
        permissions_count: request.permissions_requested.length,
        granted_at: grantedAt.toISOString(),
        expires_at: expiresAt.toISOString()
      }
    });

    console.log('Permissions granted successfully:', policyName);

    // Return execution result with expiration timestamp for Wait state
    return {
      policy_name: policyName,
      attached_at: grantedAt.toISOString(),
      permission_expires_at: expiresAt.toISOString(), // Critical for Wait state!
      target_principal: principalArn,
      permissions_granted: request.permissions_requested.length
    };

  } catch (error) {
    console.error('Error granting permissions:', error);
    
    // Log failure
    if (event.request_id || event.execution_arn) {
      await logAudit({
        request_id: event.request_id || event.execution_arn,
        action: 'GRANT_FAILED',
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

/**
 * Verify that the IAM role exists
 */
async function verifyRole(roleName) {
  const command = new GetRoleCommand({ RoleName: roleName });
  
  try {
    await iamClient.send(command);
  } catch (error) {
    if (error.name === 'NoSuchEntityException') {
      throw new Error(`Role does not exist: ${roleName}`);
    }
    throw error;
  }
}

/**
 * Build IAM policy document from requested permissions
 */
function buildPolicyDocument(permissions) {
  // Group permissions by resource for efficiency
  const statementMap = new Map();

  for (const perm of permissions) {
    if (!statementMap.has(perm.resource)) {
      statementMap.set(perm.resource, []);
    }
    statementMap.get(perm.resource).push(perm.action);
  }

  // Build statements
  const statements = Array.from(statementMap.entries()).map(([resource, actions]) => ({
    Effect: 'Allow',
    Action: actions,
    Resource: resource
  }));

  return {
    Version: '2012-10-17',
    Statement: statements
  };
}
