#!/usr/bin/env node
/**
 * WebMaster v3 - DynamoDB Registry Client
 * Handles all deployment registry operations
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = 'webmaster-deployments';
const REGION = process.env.AWS_REGION || 'us-east-2';

const client = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(client);

/**
 * Register a new deployment in the registry
 */
async function registerDeployment(params) {
  const {
    siteName,
    bucketName,
    bucketRegion,
    distributionId,
    domainName,
    owner,
    description = null,
    customDomain = null
  } = params;

  const timestamp = Date.now();
  const siteId = `${siteName}-${timestamp}`;
  const now = new Date().toISOString();
  
  const primaryUrl = customDomain 
    ? `https://${customDomain}/`
    : `https://${domainName}/`;

  const item = {
    siteId,
    siteName,
    description,
    owner,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    primaryUrl,
    customDomain,
    dnsConfigured: false,
    bucket: {
      name: bucketName,
      region: bucketRegion
    },
    cloudfront: {
      distributionId,
      domainName
    },
    lastDeployment: {
      deployedAt: now,
      deployedBy: owner
    }
  };

  await docClient.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: item
  }));

  return { siteId, item };
}

/**
 * Get deployment by siteId
 */
async function getDeployment(siteId) {
  const result = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { siteId }
  }));
  
  return result.Item;
}

/**
 * Update deployment (e.g., after new push)
 */
async function updateDeployment(siteId, updates) {
  const now = new Date().toISOString();
  
  // Build update expression
  let updateExpression = 'SET updatedAt = :now';
  const expressionAttributeValues = { ':now': now };
  const expressionAttributeNames = {};
  
  if (updates.deployedBy) {
    updateExpression += ', lastDeployment = :lastDep';
    expressionAttributeValues[':lastDep'] = {
      deployedAt: now,
      deployedBy: updates.deployedBy
    };
  }
  
  if (updates.customDomain) {
    updateExpression += ', customDomain = :domain, primaryUrl = :url, dnsConfigured = :dns';
    expressionAttributeValues[':domain'] = updates.customDomain;
    expressionAttributeValues[':url'] = `https://${updates.customDomain}/`;
    expressionAttributeValues[':dns'] = updates.dnsConfigured || false;
  }
  
  if (updates.status) {
    updateExpression += ', #status = :status';
    expressionAttributeNames['#status'] = 'status';
    expressionAttributeValues[':status'] = updates.status;
  }

  const command = new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { siteId },
    UpdateExpression: updateExpression,
    ExpressionAttributeValues: expressionAttributeValues,
    ...(Object.keys(expressionAttributeNames).length > 0 && { ExpressionAttributeNames: expressionAttributeNames }),
    ReturnValues: 'ALL_NEW'
  });

  const result = await docClient.send(command);
  return result.Attributes;
}

/**
 * List deployments (with optional filters)
 */
async function listDeployments(options = {}) {
  const { owner, status, limit = 50 } = options;

  let command;
  
  if (owner) {
    // Query by owner GSI
    command = new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'byOwner',
      KeyConditionExpression: '#owner = :owner',
      ExpressionAttributeNames: { '#owner': 'owner' },
      ExpressionAttributeValues: { ':owner': owner },
      Limit: limit,
      ScanIndexForward: false // Most recent first
    });
  } else if (status) {
    // Query by status GSI
    command = new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'byStatus',
      KeyConditionExpression: '#status = :status',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':status': status },
      Limit: limit,
      ScanIndexForward: false
    });
  } else {
    // Scan all (use sparingly)
    const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
    command = new ScanCommand({
      TableName: TABLE_NAME,
      Limit: limit
    });
  }

  const result = await docClient.send(command);
  return result.Items || [];
}

/**
 * Find deployment by URL (CloudFront or custom domain)
 */
async function findByUrl(url) {
  // Normalize URL
  const normalized = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const searchUrl = `https://${normalized}/`;

  const result = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: 'byPrimaryUrl',
    KeyConditionExpression: 'primaryUrl = :url',
    ExpressionAttributeValues: { ':url': searchUrl }
  }));

  return result.Items?.[0];
}

module.exports = {
  registerDeployment,
  getDeployment,
  updateDeployment,
  listDeployments,
  findByUrl
};

// CLI support
if (require.main === module) {
  const command = process.argv[2];
  const args = process.argv.slice(3);

  (async () => {
    try {
      switch (command) {
        case 'list':
          const owner = args.find(a => a.startsWith('--owner='))?.split('=')[1];
          const status = args.find(a => a.startsWith('--status='))?.split('=')[1];
          const deployments = await listDeployments({ owner, status });
          console.log(JSON.stringify(deployments, null, 2));
          break;

        case 'get':
          const siteId = args[0];
          const deployment = await getDeployment(siteId);
          console.log(JSON.stringify(deployment, null, 2));
          break;

        case 'find-url':
          const url = args[0];
          const found = await findByUrl(url);
          console.log(JSON.stringify(found, null, 2));
          break;

        default:
          console.error('Usage: registry.js <list|get|find-url> [options]');
          process.exit(1);
      }
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  })();
}
