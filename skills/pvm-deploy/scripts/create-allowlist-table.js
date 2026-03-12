#!/usr/bin/env node
/**
 * Create DynamoDB table for PVM permission allowlist
 * 
 * Table name: pvm-allowlist
 * Primary Key: id (String) - Fixed value "current"
 * 
 * Usage:
 *   node scripts/create-allowlist-table.js
 *   node scripts/create-allowlist-table.js --region us-west-2
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { 
  DynamoDBDocumentClient, 
  PutCommand 
} = require('@aws-sdk/lib-dynamodb');
const { 
  CreateTableCommand, 
  waitUntilTableExists 
} = require('@aws-sdk/client-dynamodb');

const TABLE_NAME = 'pvm-allowlist';

// Parse command line arguments
const args = process.argv.slice(2);
const regionIndex = args.indexOf('--region');
const region = regionIndex >= 0 && args[regionIndex + 1] ? args[regionIndex + 1] : 'us-west-2';

const dynamoClient = new DynamoDBClient({ region });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// Initial allowlist data with new DynamoDB cleanup actions
const INITIAL_ALLOWLIST = {
  id: 'current',
  allowedActions: [
    's3:GetObject',
    's3:PutObject',
    's3:ListBucket',
    'dynamodb:GetItem',
    'dynamodb:PutItem',
    'dynamodb:Query',
    'dynamodb:Scan',
    'dynamodb:UpdateItem',
    'dynamodb:DeleteItem',
    'lambda:InvokeFunction'
  ],
  deniedActions: [
    'iam:*',
    '*:*',
    'organizations:*',
    'account:*'
  ],
  version: 1,
  updatedAt: new Date().toISOString(),
  updatedBy: 'system-initialization',
  description: 'Initial allowlist for PVM - includes DynamoDB cleanup actions'
};

async function createTable() {
  console.log(`Creating DynamoDB table: ${TABLE_NAME} in region ${region}...`);
  
  const createTableParams = {
    TableName: TABLE_NAME,
    KeySchema: [
      { AttributeName: 'id', KeyType: 'HASH' } // Partition key
    ],
    AttributeDefinitions: [
      { AttributeName: 'id', AttributeType: 'S' }
    ],
    BillingMode: 'PAY_PER_REQUEST', // On-demand billing
    Tags: [
      { Key: 'Application', Value: 'PermissionsVendingMachine' },
      { Key: 'Component', Value: 'Allowlist' },
      { Key: 'ManagedBy', Value: 'PVM-Scripts' }
    ]
  };
  
  try {
    const command = new CreateTableCommand(createTableParams);
    const result = await dynamoClient.send(command);
    console.log('Table creation initiated:', result.TableDescription.TableName);
    
    // Wait for table to be active
    console.log('Waiting for table to become active...');
    await waitUntilTableExists(
      { client: dynamoClient, maxWaitTime: 120 },
      { TableName: TABLE_NAME }
    );
    console.log('✓ Table is now active');
    
    return true;
  } catch (error) {
    if (error.name === 'ResourceInUseException') {
      console.log('Table already exists, skipping creation');
      return true;
    }
    throw error;
  }
}

async function insertInitialData() {
  console.log('Inserting initial allowlist data...');
  
  try {
    const command = new PutCommand({
      TableName: TABLE_NAME,
      Item: INITIAL_ALLOWLIST
    });
    
    await docClient.send(command);
    console.log('✓ Initial allowlist data inserted');
    console.log('\nAllowlist contents:');
    console.log('  Allowed actions:', INITIAL_ALLOWLIST.allowedActions.length);
    console.log('  Denied actions:', INITIAL_ALLOWLIST.deniedActions.length);
    console.log('  Version:', INITIAL_ALLOWLIST.version);
    console.log('  Description:', INITIAL_ALLOWLIST.description);
    
    return true;
  } catch (error) {
    console.error('Failed to insert initial data:', error.message);
    throw error;
  }
}

async function main() {
  try {
    console.log('=== PVM Allowlist Table Setup ===\n');
    
    // Create table
    await createTable();
    
    // Insert initial data
    await insertInitialData();
    
    console.log('\n=== Setup Complete ===');
    console.log(`\nTable: ${TABLE_NAME}`);
    console.log(`Region: ${region}`);
    console.log('\nNext steps:');
    console.log('1. Update Lambda IAM roles with DynamoDB permissions (see IAM-PERMISSIONS.md)');
    console.log('2. Deploy updated Lambda functions');
    console.log('3. Test admin API endpoints');
    
    process.exit(0);
  } catch (error) {
    console.error('\n✗ Setup failed:', error.message);
    console.error('\nStack trace:', error.stack);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { createTable, insertInitialData, INITIAL_ALLOWLIST };
