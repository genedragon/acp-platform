// Log failure events
const { updateRequestStatus, logAudit } = require('./db');

/**
 * Lambda handler for logging failures
 * Used by error handlers in state machine
 */
exports.handler = async (event) => {
  console.log('LogFailure task started:', JSON.stringify(event, null, 2));

  try {
    const { request, failure_type, error } = event;
    const requestId = request?.request_id || request?.execution_arn || event.request_id;

    if (!requestId) {
      console.error('No request ID available for logging');
      return { logged: false };
    }

    // Update request status based on failure type
    const statusMap = {
      'store_failed': 'FAILED',
      'approval_failed': 'FAILED',
      'grant_failed': 'GRANT_FAILED',
      'revoke_failed': 'REVOCATION_FAILED'
    };

    const status = statusMap[failure_type] || 'FAILED';

    await updateRequestStatus(requestId, status, {
      failed_at: new Date().toISOString(),
      failure_reason: failure_type,
      error_details: error ? JSON.stringify(error) : undefined
    });

    // Log audit entry
    await logAudit({
      request_id: requestId,
      action: `FAILURE_${failure_type.toUpperCase()}`,
      actor: 'system',
      details: {
        failure_type: failure_type,
        error: error?.message || error,
        timestamp: new Date().toISOString()
      }
    });

    console.log('Failure logged:', failure_type);

    return {
      logged: true,
      failure_type: failure_type,
      request_id: requestId
    };

  } catch (logError) {
    console.error('Error logging failure:', logError);
    // Don't throw - we don't want logging failures to break the workflow
    return {
      logged: false,
      error: logError.message
    };
  }
};
