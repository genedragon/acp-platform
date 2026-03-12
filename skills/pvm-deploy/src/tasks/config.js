// Configuration management for PVM
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');

// Default safe fallback allowlist
const DEFAULT_ALLOWLIST = {
  allowedActions: [
    's3:GetObject',
    's3:ListBucket'
  ],
  deniedActions: [
    'iam:*',
    '*:*',
    'organizations:*',
    'account:*'
  ],
  description: 'Safe default allowlist (DynamoDB unavailable)'
};

class Config {
  constructor() {
    // Environment variables
    this.stateMachineArn = process.env.STATE_MACHINE_ARN;
    this.approverEmail = process.env.APPROVER_EMAIL || 'approver@example.com';
    this.allowedVpcIds = (process.env.ALLOWED_VPC_IDS || 'vpc-EXAMPLE').split(',');
    this.jwtSecretArn = process.env.JWT_SECRET_ARN;
    this.requestsTableName = process.env.DYNAMODB_REQUESTS_TABLE || 'pvm-requests';
    this.auditTableName = process.env.DYNAMODB_AUDIT_TABLE || 'pvm-audit-logs';
    this.allowlistTableName = process.env.DYNAMODB_ALLOWLIST_TABLE || 'pvm-allowlist';
    this.region = process.env.AWS_REGION || 'us-west-2';
    this.adminApiKey = process.env.ADMIN_API_KEY;
    
    // DynamoDB client for loading allowlist
    const dynamoClient = new DynamoDBClient({ region: this.region });
    this.docClient = DynamoDBDocumentClient.from(dynamoClient);
    
    // Cached allowlist with TTL
    this.allowlistCache = null;
    this.allowlistCacheExpiry = 0;
    this.allowlistCacheTTL = 5 * 60 * 1000; // 5 minutes in milliseconds
  }

  /**
   * Load permission allowlist from DynamoDB
   * Cached for 5 minutes to reduce API calls
   */
  async loadAllowlist() {
    const now = Date.now();
    
    // Return cached version if still valid
    if (this.allowlistCache && now < this.allowlistCacheExpiry) {
      return this.allowlistCache;
    }
    
    try {
      const command = new GetCommand({
        TableName: this.allowlistTableName,
        Key: { id: 'current' }
      });
      
      const response = await this.docClient.send(command);
      
      if (!response.Item) {
        throw new Error('Allowlist not found in DynamoDB');
      }
      
      const allowlist = response.Item;
      
      // Validate structure
      if (!allowlist.allowedActions || !Array.isArray(allowlist.allowedActions)) {
        throw new Error('Invalid allowlist structure: missing allowedActions array');
      }
      if (!allowlist.deniedActions || !Array.isArray(allowlist.deniedActions)) {
        throw new Error('Invalid allowlist structure: missing deniedActions array');
      }
      
      // Cache the result
      this.allowlistCache = allowlist;
      this.allowlistCacheExpiry = now + this.allowlistCacheTTL;
      
      console.log(`Loaded allowlist from DynamoDB (version ${allowlist.version || 'unknown'})`);
      return allowlist;
      
    } catch (error) {
      console.error('Failed to load allowlist from DynamoDB, using safe defaults:', error.message);
      
      // Use safe defaults if DynamoDB unavailable
      this.allowlistCache = DEFAULT_ALLOWLIST;
      this.allowlistCacheExpiry = now + this.allowlistCacheTTL;
      
      return DEFAULT_ALLOWLIST;
    }
  }

  /**
   * Invalidate allowlist cache
   * Call this after updating the allowlist in DynamoDB
   */
  invalidateAllowlistCache() {
    this.allowlistCache = null;
    this.allowlistCacheExpiry = 0;
    console.log('Allowlist cache invalidated');
  }

  /**
   * Get allowlist (sync accessor for backward compatibility)
   * Note: This returns cached value or safe default if not loaded yet
   * Prefer using loadAllowlist() for async access
   */
  get allowlist() {
    return this.allowlistCache || DEFAULT_ALLOWLIST;
  }

  validate() {
    const errors = [];
    
    if (!this.approverEmail) {
      errors.push('APPROVER_EMAIL is required');
    }
    
    if (!this.allowedVpcIds || this.allowedVpcIds.length === 0) {
      errors.push('ALLOWED_VPC_IDS is required');
    }
    
    if (errors.length > 0) {
      throw new Error(`Configuration validation failed: ${errors.join(', ')}`);
    }
    
    return true;
  }
}

module.exports = new Config();
