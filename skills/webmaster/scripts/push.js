#!/usr/bin/env node
/**
 * WebMaster v5 - Push/Update Command
 * Update existing sites with new content
 */

const { S3Client, PutObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { CloudFrontClient, CreateInvalidationCommand } = require('@aws-sdk/client-cloudfront');
const fs = require('fs');
const path = require('path');
const { rewriteDirectory } = require('./rewrite-paths');
const { getDeployment, findByUrl, updateDeployment } = require('./registry');
const { validateAssets } = require('./validate-assets');
const { checkLinks } = require('./check-links');

// Optional: accessibility checking
let checkAccessibility = null;
try {
  ({ checkAccessibility } = require('./check-accessibility'));
} catch (error) {
  // pa11y not available
}

const REGION = process.env.AWS_REGION || 'us-east-2';

/**
 * Push updates to existing site
 */
async function pushSite(options) {
  const {
    siteDir,
    siteId,
    url,
    skipChecks = false,
    deployedBy = process.env.USER || 'agent'
  } = options;

  console.log('🔄 Pushing updates to existing site...\n');

  // Step 1: Lookup site in registry
  let site;
  if (siteId) {
    site = await getDeployment(siteId);
    if (!site) {
      throw new Error(`Site not found: ${siteId}`);
    }
  } else if (url) {
    site = await findByUrl(url);
    if (!site) {
      throw new Error(`Site not found for URL: ${url}`);
    }
  } else {
    throw new Error('Must provide either --site-id or --url');
  }

  console.log(`✅ Found site: ${site.siteName} (${site.siteId})`);
  console.log(`   Bucket: ${site.bucket.name}`);
  console.log(`   Distribution: ${site.cloudfront.distributionId}\n`);

  // Step 2: Quality checks
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
    
    // Accessibility (optional)
    if (checkAccessibility) {
      try {
        const a11yResult = await checkAccessibility(siteDir, { verbose: false });
        if (!a11yResult.skipped && !a11yResult.valid) {
          console.log('\n💡 Fix accessibility errors or use --no-checks to skip\n');
          throw new Error('Accessibility checking failed');
        }
      } catch (error) {
        console.log(`⚠️  Accessibility check skipped\n`);
      }
    }
  } else {
    console.log('⚠️  Quality checks skipped (--no-checks flag)\n');
  }

  // Step 3: Rewrite asset paths
  console.log('✏️  Rewriting asset paths...');
  const rewriteResult = rewriteDirectory(siteDir, '', { verbose: false });
  console.log(`✅ Rewrote ${rewriteResult.changedFiles} HTML file(s)\n`);

  // Step 4: Upload files to S3
  console.log('📤 Uploading files to S3...');
  const s3Client = new S3Client({ region: site.bucket.region || REGION });
  const uploadedCount = await uploadDirectory(s3Client, siteDir, site.bucket.name, '');
  console.log(`✅ Uploaded ${uploadedCount} file(s)\n`);

  // Step 5: Invalidate CloudFront cache
  console.log('♻️  Invalidating CloudFront cache...');
  const cfClient = new CloudFrontClient({ region: 'us-east-1' });
  const invalidation = await cfClient.send(new CreateInvalidationCommand({
    DistributionId: site.cloudfront.distributionId,
    InvalidationBatch: {
      CallerReference: `push-${Date.now()}`,
      Paths: {
        Quantity: 1,
        Items: ['/*']
      }
    }
  }));
  console.log(`✅ Cache invalidated (ID: ${invalidation.Invalidation.Id})\n`);

  // Step 6: Update registry
  console.log('📝 Updating deployment registry...');
  await updateDeployment(site.siteId, {
    deployedBy,
    deployedAt: new Date().toISOString()
  });
  console.log('✅ Registry updated\n');

  // Done!
  console.log('🎉 Push complete!');
  console.log('');
  console.log(`   Site: ${site.siteName}`);
  console.log(`   URL: ${site.primaryUrl}`);
  console.log(`   Files: ${uploadedCount} uploaded`);
  console.log('');
  console.log('⏳ Note: CloudFront cache invalidation in progress (~2-3 minutes)');

  return {
    siteId: site.siteId,
    siteName: site.siteName,
    url: site.primaryUrl,
    filesUploaded: uploadedCount
  };
}

/**
 * Upload directory to S3
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

module.exports = { pushSite };

// CLI support
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.error('Usage: push.js <site-directory> [options]');
    console.error('');
    console.error('Options:');
    console.error('  --site-id <id>            Site ID from registry');
    console.error('  --url <url>               Site URL (looks up in registry)');
    console.error('  --no-checks               Skip quality checks');
    console.error('');
    console.error('Examples:');
    console.error('  push.js ./my-site --site-id my-site-1773145000');
    console.error('  push.js ./my-site --url https://d12oif.cloudfront.net/');
    process.exit(1);
  }
  
  const siteDir = args[0];
  const siteId = args.find(a => a === '--site-id') ? args[args.indexOf('--site-id') + 1] : null;
  const url = args.find(a => a === '--url') ? args[args.indexOf('--url') + 1] : null;
  const skipChecks = args.includes('--no-checks');
  
  if (!siteId && !url) {
    console.error('Error: Must provide either --site-id or --url');
    process.exit(1);
  }
  
  if (!fs.existsSync(siteDir)) {
    console.error(`Error: Directory not found: ${siteDir}`);
    process.exit(1);
  }
  
  (async () => {
    try {
      await pushSite({ siteDir, siteId, url, skipChecks });
      process.exit(0);
    } catch (error) {
      console.error('');
      console.error('❌ Push failed:', error.message);
      if (error.stack) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  })();
}
