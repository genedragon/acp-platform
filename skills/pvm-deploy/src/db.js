// DynamoDB helper functions
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { 
  DynamoDBDocumentClient, 
  PutCommand, 
  GetCommand, 
  UpdateCommand, 
  QueryCommand 
} = require('@aws-sdk/lib-dynamodb');
const config = require('./config');

const client = new DynamoDBClient({ region: config.region });
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true
  }
});

/**
 * Store a permission request in DynamoDB
 */
async function storeRequest(requestData) {
  const item = {
    request_id: requestData.request_id,
    execution_arn: requestData.execution_arn,
    status: requestData.status || 'PENDING',
    requester: requestData.requester,
    permissions_requested: requestData.permissions_requested,
    expiration_minutes: requestData.expiration_minutes,
    created_at: requestData.created_at || new Date().toISOString(),
    ttl: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60) // 90 days
  };

  const command = new PutCommand({
    TableName: config.requestsTableName,
    Item: item
  });

  await docClient.send(command);
  return item;
}

/**
 * Get a permission request by ID
 */
async function getRequest(requestId) {
  const command = new GetCommand({
    TableName: config.requestsTableName,
    Key: { request_id: requestId }
  });

  const response = await docClient.send(command);
  return response.Item;
}

/**
 * Update request status
 */
async function updateRequestStatus(requestId, status, additionalData = {}) {
  const updateExpression = ['#status = :status'];
  const expressionAttributeValues = { ':status': status };
  const expressionAttributeNames = { '#status': 'status' };

  // Add additional fields to update
  Object.keys(additionalData).forEach((key, index) => {
    const attrName = `#attr${index}`;
    const attrValue = `:val${index}`;
    expressionAttributeNames[attrName] = key;
    expressionAttributeValues[attrValue] = additionalData[key];
    updateExpression.push(`${attrName} = ${attrValue}`);
  });

  const command = new UpdateCommand({
    TableName: config.requestsTableName,
    Key: { request_id: requestId },
    UpdateExpression: `SET ${updateExpression.join(', ')}`,
    ExpressionAttributeValues: expressionAttributeValues,
    ...(Object.keys(expressionAttributeNames).length > 0 && {
      ExpressionAttributeNames: expressionAttributeNames
    })
  });

  await docClient.send(command);
}

/**
 * Log an audit entry
 */
async function logAudit(logEntry) {
  const item = {
    log_id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    request_id: logEntry.request_id,
    timestamp: logEntry.timestamp || new Date().toISOString(),
    action: logEntry.action,
    actor: logEntry.actor || 'system',
    details: logEntry.details || {},
    ttl: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60) // 90 days
  };

  const command = new PutCommand({
    TableName: config.auditTableName,
    Item: item
  });

  await docClient.send(command);
  return item;
}

/**
 * Query audit logs by request ID
 */
async function getAuditLogs(requestId) {
  const command = new QueryCommand({
    TableName: config.auditTableName,
    IndexName: 'request_id-timestamp-index',
    KeyConditionExpression: 'request_id = :requestId',
    ExpressionAttributeValues: {
      ':requestId': requestId
    },
    ScanIndexForward: true // Sort by timestamp ascending
  });

  const response = await docClient.send(command);
  return response.Items || [];
}

module.exports = {
  storeRequest,
  getRequest,
  updateRequestStatus,
  logAudit,
  getAuditLogs
};
