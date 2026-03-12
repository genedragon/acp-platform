#!/usr/bin/env node
/**
 * WebMaster v3 - Main Deployment Script
 * Deploys static sites with dedicated buckets, auto asset fixing, and registry tracking
 */

const { S3Client, CreateBucketCommand, PutObjectCommand, PutBucketPolicyCommand, PutPublicAccessBlockCommand } = require('@aws-sdk/client-s3');
const { CloudFrontClient, CreateOriginAccessControlCommand, CreateDistributionCommand, CreateInvalidationCommand } = require('@aws-sdk/client-cloudfront');
const { STSClient, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');
const fs = require('fs');
const path = require('path');
const { rewriteDirectory } = require('./rewrite-paths');
const { registerDeployment } = require('./registry');
const { validateAssets } = require('./validate-assets');
const { checkLinks } = require('./check-links');

// Optional: accessibility checking (may not work on all architectures)
let checkAccessibility = null;
try {
  ({ checkAccessibility } = require('./check-accessibility'));
} catch (error) {
  // pa11y not available, skip accessibility checks
}

const REGION = process.env.AWS_REGION || 'us-east-2';

/**
 * Deploy a static site to AWS
 */
async function deploySite(options) {
  const {
    siteDir,
    siteName,
    owner,
    description = null,
    customDomain = null,
    skipChecks = false
  } = options;

  console.log(`🚀 Deploying site: ${siteName}`);
  console.log(`   Source: ${siteDir}`);
  console.log(`   Owner: ${owner}`);
  console.log('');

  // Step 0: Quality checks (v4)
  if (!skipChecks) {
    console.log('🔍 Running quality checks...\n');
    
    // Asset validation
    const assetResult = validateAssets(siteDir, { verbose: false });
    if (!assetResult.valid) {
      console.log('\n💡 Fix missing assets or use --no-checks to skip validation\n');
      throw new Error('Asset validation failed');
    }
    console.log(`✅ Asset validation: ${assetResult.stats.totalReferences} reference(s), 0 missing\n`);
    
    // Link checking
    const linkResult = checkLinks(siteDir, { verbose: false });
    if (!linkResult.valid) {
      console.log('\n💡 Fix broken links or use --no-checks to skip validation\n');
      throw new Error('Link checking failed');
    }
    console.log(`✅ Link checking: ${linkResult.stats.totalLinks} link(s), 0 broken\n`);
    
    // Accessibility checking (optional, may not work on all systems)
    if (checkAccessibility) {
      try {
        const a11yResult = await checkAccessibility(siteDir, { verbose: false });
        if (!a11yResult.skipped) {
          if (!a11yResult.valid) {
            console.log('\n💡 Fix accessibility errors or use --no-checks to skip validation\n');
            throw new Error('Accessibility checking failed');
          }
          console.log(`✅ Accessibility: ${a11yResult.stats.errorCount} error(s), ${a11yResult.stats.warningCount} warning(s)\n`);
        }
      } catch (error) {
        console.log(`⚠️  Accessibility check skipped (${error.message})\n`);
      }
    }
    
    // Warnings (non-blocking)
    if (assetResult.warnings.length > 0) {
      console.log(`⚠️  ${assetResult.warnings.length} warning(s):`);
      for (const { warning } of assetResult.warnings.slice(0, 5)) {
        console.log(`   ${warning}`);
      }
      if (assetResult.warnings.length > 5) {
        console.log(`   ... and ${assetResult.warnings.length - 5} more`);
      }
      console.log('');
    }
  } else {
    console.log('⚠️  Quality checks skipped (--no-checks flag)\n');
  }

  // Step 1: Get AWS account info
  const stsClient = new STSClient({ region: REGION });
  const identity = await stsClient.send(new GetCallerIdentityCommand({}));
  const accountId = identity.Account;
  
  console.log(`✅ AWS Account: ${accountId}`);
  
  // Step 2: Create unique bucket name
  const timestamp = Date.now();
  const bucketName = `webmaster-${siteName}-${timestamp}`;
  
  console.log(`✅ Creating S3 bucket: ${bucketName}`);
  
  const s3Client = new S3Client({ region: REGION });
  
  await s3Client.send(new CreateBucketCommand({
    Bucket: bucketName,
    CreateBucketConfiguration: {
      LocationConstraint: REGION
    }
  }));
  
  // Block public access (CloudFront will use OAC)
  await s3Client.send(new PutPublicAccessBlockCommand({
    Bucket: bucketName,
    PublicAccessBlockConfiguration: {
      BlockPublicAcls: true,
      IgnorePublicAcls: true,
      BlockPublicPolicy: true,
      RestrictPublicBuckets: true
    }
  }));
  
  console.log(`✅ Bucket created and secured`);
  
  // Step 3: Create Origin Access Control (OAC)
  const cfClient = new CloudFrontClient({ region: 'us-east-1' }); // CloudFront is global
  
  const oacResponse = await cfClient.send(new CreateOriginAccessControlCommand({
    OriginAccessControlConfig: {
      Name: `${bucketName}-oac`,
      Description: `OAC for ${siteName}`,
      SigningProtocol: 'sigv4',
      SigningBehavior: 'always',
      OriginAccessControlOriginType: 's3'
    }
  }));
  
  const oacId = oacResponse.OriginAccessControl.Id;
  console.log(`✅ Created OAC: ${oacId}`);
  
  // Step 4: Create CloudFront distribution
  console.log(`✅ Creating CloudFront distribution...`);
  
  const distResponse = await cfClient.send(new CreateDistributionCommand({
    DistributionConfig: {
      CallerReference: `${bucketName}-${Date.now()}`,
      Comment: `WebMaster v3: ${siteName}`,
      Enabled: true,
      DefaultRootObject: 'index.html',
      Origins: {
        Quantity: 1,
        Items: [{
          Id: 'S3Origin',
          DomainName: `${bucketName}.s3.${REGION}.amazonaws.com`,
          OriginAccessControlId: oacId,
          S3OriginConfig: {
            OriginAccessIdentity: '' // Empty for OAC
          }
        }]
      },
      DefaultCacheBehavior: {
        TargetOriginId: 'S3Origin',
        ViewerProtocolPolicy: 'redirect-to-https',
        AllowedMethods: {
          Quantity: 2,
          Items: ['GET', 'HEAD']
        },
        CachedMethods: {
          Quantity: 2,
          Items: ['GET', 'HEAD']
        },
        ForwardedValues: {
          QueryString: false,
          Cookies: { Forward: 'none' }
        },
        MinTTL: 0,
        DefaultTTL: 86400,
        MaxTTL: 31536000,
        Compress: true
      }
    }
  }));
  
  const distributionId = distResponse.Distribution.Id;
  const domainName = distResponse.Distribution.DomainName;
  
  console.log(`✅ Distribution created: ${distributionId}`);
  console.log(`   Domain: ${domainName}`);
  
  // Step 5: Apply bucket policy (allow CloudFront OAC)
  const bucketPolicy = {
    Version: '2012-10-17',
    Statement: [
      {
        Sid: 'AllowCloudFrontOAC',
        Effect: 'Allow',
        Principal: {
          Service: 'cloudfront.amazonaws.com'
        },
        Action: 's3:GetObject',
        Resource: `arn:aws:s3:::${bucketName}/*`,
        Condition: {
          StringEquals: {
            'AWS:SourceArn': `arn:aws:cloudfront::${accountId}:distribution/${distributionId}`
          }
        }
      }
    ]
  };
  
  await s3Client.send(new PutBucketPolicyCommand({
    Bucket: bucketName,
    Policy: JSON.stringify(bucketPolicy)
  }));
  
  console.log(`✅ Bucket policy applied`);
  
  // Step 6: Rewrite asset paths (fix CSS/JS links)
  console.log(`✏️  Rewriting asset paths...`);
  const rewriteResult = rewriteDirectory(siteDir, '', { verbose: false });
  console.log(`✅ Rewrote ${rewriteResult.changedFiles} HTML file(s)`);
  
  // Step 7: Upload files to S3
  console.log(`📤 Uploading files...`);
  
  const uploadedFiles = await uploadDirectory(s3Client, siteDir, bucketName, '');
  
  console.log(`✅ Uploaded ${uploadedFiles} file(s)`);
  
  // Step 8: Register in DynamoDB
  console.log(`📝 Registering deployment...`);
  
  const registration = await registerDeployment({
    siteName,
    bucketName,
    bucketRegion: REGION,
    distributionId,
    domainName,
    owner,
    description,
    customDomain
  });
  
  console.log(`✅ Registered as: ${registration.siteId}`);
  
  // Done!
  console.log('');
  console.log('🎉 Deployment complete!');
  console.log('');
  console.log(`   Site ID: ${registration.siteId}`);
  console.log(`   CloudFront URL: https://${domainName}/`);
  console.log(`   S3 Bucket: ${bucketName}`);
  console.log(`   Distribution ID: ${distributionId}`);
  console.log('');
  console.log('⏳ Note: CloudFront distribution is deploying (~2-3 minutes)');
  console.log('   Check status: aws cloudfront get-distribution --id ' + distributionId);
  
  return {
    siteId: registration.siteId,
    bucketName,
    distributionId,
    domainName,
    url: `https://${domainName}/`
  };
}

/**
 * Upload directory to S3 recursively
 */
async function uploadDirectory(s3Client, dirPath, bucketName, prefix) {
  let fileCount = 0;
  
  async function uploadDir(dir, s3Prefix) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const s3Key = s3Prefix ? `${s3Prefix}/${entry.name}` : entry.name;
      
      if (entry.isDirectory()) {
        await uploadDir(fullPath, s3Key);
      } else {
        const content = fs.readFileSync(fullPath);
        const contentType = getContentType(entry.name);
        
        await s3Client.send(new PutObjectCommand({
          Bucket: bucketName,
          Key: s3Key,
          Body: content,
          ContentType: contentType
        }));
        
        fileCount++;
      }
    }
  }
  
  await uploadDir(dirPath, prefix);
  return fileCount;
}

/**
 * Get MIME type from file extension
 */
function getContentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const types = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain',
    '.pdf': 'application/pdf'
  };
  
  return types[ext] || 'application/octet-stream';
}

module.exports = { deploySite };

// CLI support
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length < 3) {
    console.error('Usage: deploy.js <site-dir> <site-name> <owner> [options]');
    console.error('');
    console.error('Options:');
    console.error('  --description "..."       Site description');
    console.error('  --custom-domain name      Custom domain');
    console.error('  --no-checks               Skip quality checks (not recommended)');
    console.error('');
    console.error('Example:');
    console.error('  deploy.js ./my-site my-blog opusBot --description "Personal blog"');
    process.exit(1);
  }
  
  const siteDir = args[0];
  const siteName = args[1];
  const owner = args[2];
  const description = args.find(a => a === '--description') ? args[args.indexOf('--description') + 1] : null;
  const customDomain = args.find(a => a === '--custom-domain') ? args[args.indexOf('--custom-domain') + 1] : null;
  const skipChecks = args.includes('--no-checks');
  
  if (!fs.existsSync(siteDir)) {
    console.error(`Error: Directory not found: ${siteDir}`);
    process.exit(1);
  }
  
  deploySite({ siteDir, siteName, owner, description, customDomain, skipChecks })
    .then(result => {
      process.exit(0);
    })
    .catch(error => {
      console.error('');
      console.error('❌ Deployment failed:', error.message);
      console.error(error.stack);
      process.exit(1);
    });
}
