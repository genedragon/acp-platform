#!/usr/bin/env node
/**
 * WebMaster v3 - List Deployments
 * Query and display registered deployments
 */

const { listDeployments } = require('./registry');

async function listSites(options = {}) {
  const { owner, status } = options;
  
  console.log('📋 WebMaster Deployments');
  console.log('');
  
  const deployments = await listDeployments({ owner, status });
  
  if (deployments.length === 0) {
    console.log('No deployments found.');
    return;
  }
  
  for (const site of deployments) {
    console.log(`🌐 ${site.siteName} (${site.siteId})`);
    console.log(`   URL: ${site.primaryUrl}`);
    console.log(`   Owner: ${site.owner}`);
    console.log(`   Status: ${site.status}`);
    console.log(`   Bucket: ${site.bucket.name}`);
    console.log(`   Distribution: ${site.cloudfront.distributionId}`);
    console.log(`   Created: ${new Date(site.createdAt).toLocaleString()}`);
    
    if (site.lastDeployment) {
      console.log(`   Last Deploy: ${new Date(site.lastDeployment.deployedAt).toLocaleString()} by ${site.lastDeployment.deployedBy}`);
    }
    
    if (site.description) {
      console.log(`   Description: ${site.description}`);
    }
    
    console.log('');
  }
  
  console.log(`Total: ${deployments.length} deployment(s)`);
}

module.exports = { listSites };

// CLI support
if (require.main === module) {
  const args = process.argv.slice(2);
  const owner = args.find(a => a.startsWith('--owner='))?.split('=')[1];
  const status = args.find(a => a.startsWith('--status='))?.split('=')[1] || 'active';
  
  listSites({ owner, status })
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Error:', error.message);
      process.exit(1);
    });
}
