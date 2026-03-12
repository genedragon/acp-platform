// Clean up old test requests from pvm-requests table
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, DeleteCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ region: 'us-west-2' });
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = 'pvm-requests';
const DRY_RUN = process.argv.includes('--dry-run');

async function scanTable() {
  const command = new ScanCommand({
    TableName: TABLE_NAME
  });
  
  const response = await docClient.send(command);
  return response.Items || [];
}

async function deleteRequest(requestId) {
  const command = new DeleteCommand({
    TableName: TABLE_NAME,
    Key: { request_id: requestId }
  });
  
  await docClient.send(command);
}

async function revokeRequest(requestId) {
  const command = new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { request_id: requestId },
    UpdateExpression: 'SET #status = :status, revoked_at = :revoked_at',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: {
      ':status': 'REVOKED',
      ':revoked_at': new Date().toISOString()
    }
  });
  
  await docClient.send(command);
}

async function main() {
  console.log('🔍 Scanning pvm-requests table...\n');
  
  const items = await scanTable();
  console.log(`Found ${items.length} requests\n`);
  
  const now = Date.now();
  const oneHourAgo = now - (60 * 60 * 1000);
  
  const testRequests = [];
  const expiredActive = [];
  const awaitingApproval = [];
  
  for (const item of items) {
    const submittedAt = new Date(item.submitted_at || item.created_at).getTime();
    const isTest = item.requester?.name?.includes('Test') || 
                   item.requester?.name?.includes('test') ||
                   item.requester?.name?.includes('Fresh') ||
                   item.requester?.name?.includes('Callback');
    
    if (isTest) {
      testRequests.push(item);
    }
    
    // Check for expired active requests
    if (item.status === 'ACTIVE' && item.permission_expires_at) {
      const expiresAt = new Date(item.permission_expires_at).getTime();
      if (expiresAt < now) {
        expiredActive.push(item);
      }
    }
    
    // Check for old pending requests
    if (item.status === 'AWAITING_APPROVAL' && submittedAt < oneHourAgo) {
      awaitingApproval.push(item);
    }
  }
  
  console.log('📊 Analysis:');
  console.log(`  Test requests: ${testRequests.length}`);
  console.log(`  Expired active (should be revoked): ${expiredActive.length}`);
  console.log(`  Old pending (>1h): ${awaitingApproval.length}`);
  console.log('');
  
  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
    
    console.log('Would DELETE (test requests):');
    testRequests.forEach(r => {
      console.log(`  - ${r.request_id.split(':').pop()} (${r.requester.name})`);
    });
    
    console.log('\nWould REVOKE (expired active):');
    expiredActive.forEach(r => {
      const id = r.request_id.split(':').pop();
      const expired = new Date(r.permission_expires_at).toISOString();
      console.log(`  - ${id} (expired at ${expired})`);
    });
    
    console.log('\nWould DELETE (old pending):');
    awaitingApproval.forEach(r => {
      const id = r.request_id.split(':').pop();
      const submitted = new Date(r.submitted_at || r.created_at).toISOString();
      console.log(`  - ${id} (submitted ${submitted})`);
    });
    
    console.log('\n💡 Run without --dry-run to apply changes');
    return;
  }
  
  // Apply changes
  console.log('🗑️  Deleting test requests...');
  for (const item of testRequests) {
    await deleteRequest(item.request_id);
    console.log(`  ✓ Deleted ${item.request_id.split(':').pop()}`);
  }
  
  console.log('\n⚠️  Revoking expired active requests...');
  for (const item of expiredActive) {
    await revokeRequest(item.request_id);
    console.log(`  ✓ Revoked ${item.request_id.split(':').pop()}`);
  }
  
  console.log('\n🗑️  Deleting old pending requests...');
  for (const item of awaitingApproval) {
    await deleteRequest(item.request_id);
    console.log(`  ✓ Deleted ${item.request_id.split(':').pop()}`);
  }
  
  console.log('\n✅ Cleanup complete!');
  console.log(`   Deleted: ${testRequests.length + awaitingApproval.length}`);
  console.log(`   Revoked: ${expiredActive.length}`);
}

main().catch(console.error);
