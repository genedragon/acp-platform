// Send approval email with task token
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const { generateApprovalToken } = require('./jwt');
const { logAudit } = require('./db');
const config = require('./config');

const sesClient = new SESClient({ region: config.region });

/**
 * Lambda handler for SendApprovalEmail task
 * Sends approval email and waits for callback via task token
 */
exports.handler = async (event) => {
  console.log('SendApprovalEmail task started:', JSON.stringify(event, null, 2));

  try {
    const { taskToken, request } = event;

    if (!taskToken) {
      throw new Error('Task token not provided');
    }

    const requestId = request.request_id || request.execution_arn;

    // Generate JWT tokens with embedded task token
    const approveToken = await generateApprovalToken(requestId, 'approve', taskToken, 60);
    const denyToken = await generateApprovalToken(requestId, 'deny', taskToken, 60);

    // Construct approval URLs (replace with actual API Gateway URL)
    const baseUrl = process.env.API_BASE_URL || 'https://api.example.com';
    const approveUrl = `${baseUrl}/permissions/approve?token=${approveToken}`;
    const denyUrl = `${baseUrl}/permissions/deny?token=${denyToken}`;

    // Construct email HTML
    const emailHtml = renderApprovalEmail(request, approveUrl, denyUrl);
    const emailText = renderApprovalEmailText(request, approveUrl, denyUrl);

    // Send email via SES
    const sendCommand = new SendEmailCommand({
      Source: process.env.SES_SENDER_EMAIL || 'pvm-noreply@example.com',
      Destination: {
        ToAddresses: [config.approverEmail]
      },
      Message: {
        Subject: {
          Data: `[PVM] Permission Request from ${request.requester.name}`
        },
        Body: {
          Html: {
            Data: emailHtml
          },
          Text: {
            Data: emailText
          }
        }
      }
    });

    await sesClient.send(sendCommand);

    // Log audit entry
    await logAudit({
      request_id: requestId,
      action: 'APPROVAL_EMAIL_SENT',
      actor: 'system',
      details: {
        recipient: config.approverEmail,
        sent_at: new Date().toISOString()
      }
    });

    console.log('Approval email sent successfully to:', config.approverEmail);

    // Lambda completes, but state machine waits for task token callback
    return {
      email_sent: true,
      sent_to: config.approverEmail,
      sent_at: new Date().toISOString()
    };

  } catch (error) {
    console.error('Error sending approval email:', error);
    throw error;
  }
};

/**
 * Render approval email HTML
 */
function renderApprovalEmail(request, approveUrl, denyUrl) {
  const permissions = request.permissions_requested
    .map(p => `<li><strong>${p.action}</strong> on ${p.resource}${p.reason ? `<br><em>${p.reason}</em>` : ''}</li>`)
    .join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #007bff; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f8f9fa; }
        .permission-list { background: white; padding: 15px; margin: 15px 0; border-left: 4px solid #007bff; }
        .buttons { text-align: center; margin: 30px 0; }
        .button { display: inline-block; padding: 12px 30px; margin: 0 10px; text-decoration: none; border-radius: 5px; font-weight: bold; }
        .approve { background: #28a745; color: white; }
        .deny { background: #dc3545; color: white; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Permission Request Approval</h1>
        </div>
        <div class="content">
          <p><strong>Requester:</strong> ${request.requester.name}</p>
          <p><strong>Identity:</strong> ${request.requester.identity}</p>
          <p><strong>Duration:</strong> ${request.expiration_minutes} minutes</p>
          <p><strong>Submitted:</strong> ${request.submitted_at || request.created_at}</p>
          
          <div class="permission-list">
            <h3>Requested Permissions:</h3>
            <ul>
              ${permissions}
            </ul>
          </div>

          <div class="buttons">
            <a href="${approveUrl}" class="button approve">✓ APPROVE</a>
            <a href="${denyUrl}" class="button deny">✗ DENY</a>
          </div>

          <p style="text-align: center; color: #666; font-size: 14px;">
            <em>This link expires in 60 minutes</em>
          </p>
        </div>
        <div class="footer">
          <p>Permissions Vending Machine</p>
          <p>Request ID: ${request.request_id || request.execution_arn}</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Render approval email plain text
 */
function renderApprovalEmailText(request, approveUrl, denyUrl) {
  const permissions = request.permissions_requested
    .map(p => `- ${p.action} on ${p.resource}${p.reason ? ` (${p.reason})` : ''}`)
    .join('\n');

  return `
PERMISSION REQUEST APPROVAL

Requester: ${request.requester.name}
Identity: ${request.requester.identity}
Duration: ${request.expiration_minutes} minutes
Submitted: ${request.submitted_at || request.created_at}

Requested Permissions:
${permissions}

Approve: ${approveUrl}
Deny: ${denyUrl}

This link expires in 60 minutes.

Request ID: ${request.request_id || request.execution_arn}
  `.trim();
}
