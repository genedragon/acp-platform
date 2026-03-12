// Store permission request in DynamoDB
const { storeRequest, logAudit } = require('./db');

/**
 * Lambda handler for StoreRequest task
 * Stores initial request data in DynamoDB
 */
exports.handler = async (event) => {
  console.log('StoreRequest task started:', JSON.stringify(event, null, 2));

  try {
    // Log everything we received
    console.log('Full event:', JSON.stringify(event, null, 2));
    console.log('Event keys:', Object.keys(event));
    
    // Build the execution ARN from the execution name if we have it
    let requestId;
    if (event.execution_arn) {
      requestId = event.execution_arn;
      console.log('Using execution_arn from event:', requestId);
    } else {
      // Fallback: generate our own ID
      const timestamp = Date.now();
      const random = Math.random().toString(36).substr(2, 9);
      const executionName = `pvm-${timestamp}-${random}`;
      // Note: Update ACCOUNT_ID and REGION for your deployment
      const REGION = process.env.AWS_REGION || 'us-west-2';
      const ACCOUNT_ID = process.env.AWS_ACCOUNT_ID || 'YOUR-ACCOUNT-ID';
      requestId = `arn:aws:states:${REGION}:${ACCOUNT_ID}:execution:pvm-workflow:${executionName}`;
      console.log('Generated fallback request_id:', requestId);
    }
    
    // Event already has the request fields at top level
    const request = event;

    // Prepare request data
    const requestData = {
      request_id: requestId,
      execution_arn: requestId,
      status: 'PENDING',
      requester: request.requester,
      permissions_requested: request.permissions_requested,
      expiration_minutes: request.expiration_minutes || 60,
      created_at: request.submitted_at || new Date().toISOString()
    };

    // Store in DynamoDB
    const stored = await storeRequest(requestData);

    // Log audit entry
    await logAudit({
      request_id: requestId,
      action: 'REQUEST_STORED',
      actor: 'system',
      details: {
        status: 'PENDING',
        permissions_count: request.permissions_requested.length
      }
    });

    console.log('Request stored successfully:', stored.request_id);

    // Return stored request for downstream states
    return {
      request_id: stored.request_id,
      execution_arn: stored.execution_arn,
      status: stored.status,
      created_at: stored.created_at,
      ...request // Pass through original event data
    };

  } catch (error) {
    console.error('Error storing request:', error);
    throw error;
  }
};
