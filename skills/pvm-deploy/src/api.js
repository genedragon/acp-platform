// API Gateway handler for PVM
const express = require('express');
const serverless = require('serverless-http');
const { SFNClient, StartExecutionCommand, SendTaskSuccessCommand, SendTaskFailureCommand } = require('@aws-sdk/client-sfn');
const { v4: uuidv4 } = require('uuid');
const config = require('./config');
const { validate, formatErrors } = require('./validator');
const { verifyApprovalToken } = require('./jwt');
const { logAudit } = require('./db');

const app = express();
app.use(express.json());

const sfnClient = new SFNClient({ region: config.region });

/**
 * VPC source validation middleware
 * Returns empty 200 for unauthorized sources (silent drop)
 */
function validateVpcSource(req, res, next) {
  // Check if request is from allowed VPC
  const vpcId = req.headers['x-vpc-id'] || req.apiGateway?.context?.vpcId;
  
  // For approval endpoints, allow public access
  if (req.path.includes('/approve') || req.path.includes('/deny')) {
    return next();
  }

  // For request endpoint, enforce VPC restriction
  if (!vpcId || !config.allowedVpcIds.includes(vpcId)) {
    // Silent drop - return empty response
    return res.status(200).json({});
  }

  next();
}

// VPC validation handled by API Gateway resource policy
// app.use(validateVpcSource);

/**
 * POST /permissions/request
 * Submit a new permission request
 */
app.post('/permissions/request', async (req, res) => {
  try {
    // Validate request
    const validation = await validate(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
    }

    // Generate execution name (must be unique)
    const executionName = `pvm-${Date.now()}-${uuidv4().substring(0, 8)}`;

    // Start Step Functions execution
    const startCommand = new StartExecutionCommand({
      stateMachineArn: config.stateMachineArn,
      name: executionName,
      input: JSON.stringify({
        ...req.body,
        submitted_at: new Date().toISOString(),
        source_ip: req.ip || req.headers['x-forwarded-for']
      })
    });

    const execution = await sfnClient.send(startCommand);

    // Log submission
    await logAudit({
      request_id: execution.executionArn,
      action: 'REQUEST_SUBMITTED',
      actor: req.body.requester.identity,
      details: {
        permissions_count: req.body.permissions_requested.length,
        expiration_minutes: req.body.expiration_minutes
      }
    });

    // Return 202 Accepted with execution ARN as request_id
    return res.status(202).json({
      request_id: execution.executionArn,
      status: 'PENDING',
      message: 'Request submitted for approval',
      submitted_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error processing request:', error);
    
    if (error.name === 'ValidationException') {
      return res.status(400).json({
        error: 'Invalid request format',
        message: error.message
      });
    }

    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to process permission request'
    });
  }
});

/**
 * GET /permissions/approve?token=<jwt>
 * Approve a permission request
 */
app.get('/permissions/approve', async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).send(renderErrorPage('Missing approval token'));
    }

    // Verify JWT token
    const decoded = await verifyApprovalToken(token);
    
    if (decoded.action !== 'approve') {
      return res.status(400).send(renderErrorPage('Invalid token action'));
    }

    // Send task success to Step Functions
    const successCommand = new SendTaskSuccessCommand({
      taskToken: decoded.task_token,
      output: JSON.stringify({
        approved: true,
        approved_at: new Date().toISOString(),
        approved_by: config.approverEmail
      })
    });

    await sfnClient.send(successCommand);

    // Log approval
    await logAudit({
      request_id: decoded.request_id,
      action: 'REQUEST_APPROVED',
      actor: config.approverEmail,
      details: {
        approved_at: new Date().toISOString()
      }
    });

    return res.status(200).send(renderSuccessPage('approve'));

  } catch (error) {
    console.error('Error processing approval:', error);

    if (error.message.includes('expired')) {
      return res.status(401).send(renderErrorPage('Approval link has expired'));
    }

    if (error.name === 'InvalidToken' || error.code === 'InvalidToken') {
      return res.status(403).send(renderErrorPage('This approval link has already been used or is invalid'));
    }

    return res.status(500).send(renderErrorPage('Failed to process approval'));
  }
});

/**
 * GET /permissions/deny?token=<jwt>
 * Deny a permission request
 */
app.get('/permissions/deny', async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).send(renderErrorPage('Missing denial token'));
    }

    // Verify JWT token
    const decoded = await verifyApprovalToken(token);
    
    if (decoded.action !== 'deny') {
      return res.status(400).send(renderErrorPage('Invalid token action'));
    }

    // Send task failure to Step Functions
    const failureCommand = new SendTaskFailureCommand({
      taskToken: decoded.task_token,
      error: 'RequestDenied',
      cause: JSON.stringify({
        approved: false,
        denied_at: new Date().toISOString(),
        denied_by: config.approverEmail
      })
    });

    await sfnClient.send(failureCommand);

    // Log denial
    await logAudit({
      request_id: decoded.request_id,
      action: 'REQUEST_DENIED',
      actor: config.approverEmail,
      details: {
        denied_at: new Date().toISOString()
      }
    });

    return res.status(200).send(renderSuccessPage('deny'));

  } catch (error) {
    console.error('Error processing denial:', error);

    if (error.message.includes('expired')) {
      return res.status(401).send(renderErrorPage('Denial link has expired'));
    }

    if (error.name === 'InvalidToken' || error.code === 'InvalidToken') {
      return res.status(403).send(renderErrorPage('This denial link has already been used or is invalid'));
    }

    return res.status(500).send(renderErrorPage('Failed to process denial'));
  }
});

/**
 * GET /permissions/status/:requestId
 * Query permission request status
 */
app.get('/permissions/status/:requestId', async (req, res) => {
  try {
    const { requestId } = req.params;

    // Query DynamoDB for request
    const { getRequest } = require('./db');
    const request = await getRequest(requestId);

    if (!request) {
      return res.status(404).json({
        error: 'Request not found',
        request_id: requestId
      });
    }

    // Return status with key timestamps
    return res.status(200).json({
      request_id: request.request_id,
      status: request.status,
      submitted_at: request.created_at || request.submitted_at,
      granted_at: request.granted_at,
      expires_at: request.permission_expires_at,
      revoked_at: request.revoked_at,
      permissions: request.permissions_requested
    });

  } catch (error) {
    console.error('Error fetching status:', error);
    return res.status(500).json({
      error: 'Failed to fetch request status'
    });
  }
});

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

/**
 * Render success HTML page
 */
function renderSuccessPage(action) {
  const title = action === 'approve' ? 'Request Approved' : 'Request Denied';
  const message = action === 'approve' 
    ? 'The permission request has been approved. Permissions will be granted shortly.'
    : 'The permission request has been denied. The requester will be notified.';
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${title}</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
        .success { background: #d4edda; border: 1px solid #c3e6cb; color: #155724; padding: 15px; border-radius: 5px; }
        h1 { margin: 0 0 10px 0; }
      </style>
    </head>
    <body>
      <div class="success">
        <h1>✓ ${title}</h1>
        <p>${message}</p>
        <p>You can close this window.</p>
      </div>
    </body>
    </html>
  `;
}

/**
 * Render error HTML page
 */
function renderErrorPage(message) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Error</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
        .error { background: #f8d7da; border: 1px solid #f5c6cb; color: #721c24; padding: 15px; border-radius: 5px; }
        h1 { margin: 0 0 10px 0; }
      </style>
    </head>
    <body>
      <div class="error">
        <h1>⚠ Error</h1>
        <p>${message}</p>
        <p>Please contact the system administrator if you believe this is an error.</p>
      </div>
    </body>
    </html>
  `;
}

// Export handler for Lambda
module.exports.handler = serverless(app);
module.exports.app = app; // For testing
