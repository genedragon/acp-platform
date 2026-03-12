#!/usr/bin/env node
// Script to create DynamoDB tables for PVM

const { 
  DynamoDBClient, 
  CreateTableCommand, 
  UpdateTimeToLiveCommand,
  DescribeTableCommand
} = require('@aws-sdk/client-dynamodb');

const region = process.env.AWS_REGION || 'us-west-2';
const client = new DynamoDBClient({ region });

async function createRequestsTable() {
  console.log('Creating pvm-requests table...');
  
  const command = new CreateTableCommand({
    TableName: 'pvm-requests',
    KeySchema: [
      { AttributeName: 'request_id', KeyType: 'HASH' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'request_id', AttributeType: 'S' },
      { AttributeName: 'status', AttributeType: 'S' },
      { AttributeName: 'permission_expires_at', AttributeType: 'S' }
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'status-permission_expires_at-index',
        KeySchema: [
          { AttributeName: 'status', KeyType: 'HASH' },
          { AttributeName: 'permission_expires_at', KeyType: 'RANGE' }
        ],
        Projection: { ProjectionType: 'ALL' },
        ProvisionedThroughput: {
          ReadCapacityUnits: 5,
          WriteCapacityUnits: 5
        }
      }
    ],
    BillingMode: 'PAY_PER_REQUEST',
    StreamSpecification: {
      StreamEnabled: true,
      StreamViewType: 'NEW_AND_OLD_IMAGES'
    },
    SSESpecification: {
      Enabled: true
    }
  });

  try {
    const response = await client.send(command);
    console.log('✓ pvm-requests table created');
    
    // Enable TTL
    await enableTTL('pvm-requests', 'ttl');
    
    // Enable point-in-time recovery
    await enablePITR('pvm-requests');
    
    return response;
  } catch (error) {
    if (error.name === 'ResourceInUseException') {
      console.log('✓ pvm-requests table already exists');
    } else {
      throw error;
    }
  }
}

async function createAuditLogsTable() {
  console.log('Creating pvm-audit-logs table...');
  
  const command = new CreateTableCommand({
    TableName: 'pvm-audit-logs',
    KeySchema: [
      { AttributeName: 'log_id', KeyType: 'HASH' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'log_id', AttributeType: 'S' },
      { AttributeName: 'request_id', AttributeType: 'S' },
      { AttributeName: 'timestamp', AttributeType: 'S' }
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'request_id-timestamp-index',
        KeySchema: [
          { AttributeName: 'request_id', KeyType: 'HASH' },
          { AttributeName: 'timestamp', KeyType: 'RANGE' }
        ],
        Projection: { ProjectionType: 'ALL' },
        ProvisionedThroughput: {
          ReadCapacityUnits: 5,
          WriteCapacityUnits: 5
        }
      }
    ],
    BillingMode: 'PAY_PER_REQUEST',
    StreamSpecification: {
      StreamEnabled: true,
      StreamViewType: 'NEW_AND_OLD_IMAGES'
    },
    SSESpecification: {
      Enabled: true
    }
  });

  try {
    const response = await client.send(command);
    console.log('✓ pvm-audit-logs table created');
    
    // Enable TTL
    await enableTTL('pvm-audit-logs', 'ttl');
    
    // Enable point-in-time recovery
    await enablePITR('pvm-audit-logs');
    
    return response;
  } catch (error) {
    if (error.name === 'ResourceInUseException') {
      console.log('✓ pvm-audit-logs table already exists');
    } else {
      throw error;
    }
  }
}

async function enableTTL(tableName, attributeName) {
  console.log(`Enabling TTL on ${tableName}...`);
  
  const command = new UpdateTimeToLiveCommand({
    TableName: tableName,
    TimeToLiveSpecification: {
      Enabled: true,
      AttributeName: attributeName
    }
  });

  try {
    await client.send(command);
    console.log(`✓ TTL enabled on ${tableName}`);
  } catch (error) {
    if (error.name === 'ValidationException' && error.message.includes('already enabled')) {
      console.log(`✓ TTL already enabled on ${tableName}`);
    } else {
      console.error(`Error enabling TTL on ${tableName}:`, error.message);
    }
  }
}

async function enablePITR(tableName) {
  console.log(`Enabling Point-in-Time Recovery on ${tableName}...`);
  
  const { UpdateContinuousBackupsCommand } = require('@aws-sdk/client-dynamodb');
  
  const command = new UpdateContinuousBackupsCommand({
    TableName: tableName,
    PointInTimeRecoverySpecification: {
      PointInTimeRecoveryEnabled: true
    }
  });

  try {
    await client.send(command);
    console.log(`✓ Point-in-Time Recovery enabled on ${tableName}`);
  } catch (error) {
    console.error(`Error enabling PITR on ${tableName}:`, error.message);
  }
}

async function waitForTable(tableName) {
  console.log(`Waiting for ${tableName} to become active...`);
  
  let attempts = 0;
  const maxAttempts = 30;
  
  while (attempts < maxAttempts) {
    try {
      const command = new DescribeTableCommand({ TableName: tableName });
      const response = await client.send(command);
      
      if (response.Table.TableStatus === 'ACTIVE') {
        console.log(`✓ ${tableName} is active`);
        return;
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      attempts++;
    } catch (error) {
      console.error(`Error checking table status:`, error.message);
      throw error;
    }
  }
  
  throw new Error(`Table ${tableName} did not become active within timeout`);
}

async function main() {
  console.log('=== PVM DynamoDB Table Creation ===\n');
  
  try {
    await createRequestsTable();
    await waitForTable('pvm-requests');
    
    await createAuditLogsTable();
    await waitForTable('pvm-audit-logs');
    
    console.log('\n=== All tables created successfully ===');
  } catch (error) {
    console.error('Error creating tables:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { createRequestsTable, createAuditLogsTable };
