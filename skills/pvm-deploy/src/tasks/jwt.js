// JWT token generation and verification
const jwt = require('jsonwebtoken');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const config = require('./config');

let jwtSecret = null;

/**
 * Get JWT secret from AWS Secrets Manager
 * Cached after first retrieval
 */
async function getJwtSecret() {
  if (jwtSecret) {
    return jwtSecret;
  }

  // For local development/testing
  if (process.env.JWT_SECRET) {
    jwtSecret = process.env.JWT_SECRET;
    return jwtSecret;
  }

  if (!config.jwtSecretArn) {
    throw new Error('JWT_SECRET_ARN not configured');
  }

  const client = new SecretsManagerClient({ region: config.region });
  const command = new GetSecretValueCommand({
    SecretId: config.jwtSecretArn
  });

  const response = await client.send(command);
  jwtSecret = response.SecretString;
  
  return jwtSecret;
}

/**
 * Generate approval JWT token with task token embedded
 * @param {string} requestId - Request ID (execution ARN)
 * @param {string} action - 'approve' or 'deny'
 * @param {string} taskToken - Step Functions task token
 * @param {number} expiryMinutes - Token expiry time (default 60 minutes)
 * @returns {string} JWT token
 */
async function generateApprovalToken(requestId, action, taskToken, expiryMinutes = 60) {
  const secret = await getJwtSecret();
  
  const payload = {
    request_id: requestId,
    action: action,
    task_token: taskToken,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (expiryMinutes * 60)
  };

  return jwt.sign(payload, secret, { algorithm: 'HS256' });
}

/**
 * Verify and decode JWT token
 * @param {string} token - JWT token to verify
 * @returns {Object} Decoded token payload
 * @throws {Error} If token is invalid or expired
 */
async function verifyApprovalToken(token) {
  const secret = await getJwtSecret();
  
  try {
    const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
    return decoded;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Approval link has expired');
    } else if (error.name === 'JsonWebTokenError') {
      throw new Error('Invalid approval token');
    }
    throw error;
  }
}

/**
 * Clear cached JWT secret (for testing)
 */
function clearCache() {
  jwtSecret = null;
}

module.exports = {
  generateApprovalToken,
  verifyApprovalToken,
  getJwtSecret,
  clearCache
};
