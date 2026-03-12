#!/usr/bin/env node
/**
 * WebMaster v4 - Link Checker (Regex-Based)
 * Scans HTML for internal links and verifies target files exist
 */

const fs = require('fs');
const path = require('path');

/**
 * Extract internal link references from HTML
 */
function extractInternalLinks(htmlContent) {
  const links = new Set();
  
  // Match <a href="...">
  const hrefPattern = /<a[^>]+href=["']([^"']+)["']/gi;
  
  let match;
  while ((match = hrefPattern.exec(htmlContent)) !== null) {
    const href = match[1];
    
    // Skip external URLs, anchors, mailto, tel
    if (href.startsWith('http://') || 
        href.startsWith('https://') ||
        href.startsWith('//') ||
        href.startsWith('#') ||
        href.startsWith('mailto:') ||
        href.startsWith('tel:')) {
      continue;
    }
    
    // Strip fragment/anchor from internal links
    const cleanHref = href.split('#')[0];
    
    if (cleanHref) {
      links.add(cleanHref);
    }
  }
  
  return Array.from(links);
}

/**
 * Find all HTML files
 */
function findHtmlFiles(dir) {
  const htmlFiles = [];
  
  function scan(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          scan(fullPath);
        }
      } else if (entry.name.endsWith('.html')) {
        htmlFiles.push(fullPath);
      }
    }
  }
  
  scan(dir);
  return htmlFiles;
}

/**
 * Check all links in directory
 */
function checkLinks(siteDir, options = {}) {
  const { verbose = false } = options;
  
  console.log('🔗 Checking links...\n');
  
  const htmlFiles = findHtmlFiles(siteDir);
  
  if (htmlFiles.length === 0) {
    console.log('⚠️  No HTML files found');
    return { valid: true, broken: [] };
  }
  
  const brokenLinks = [];
  const externalLinks = [];
  let totalLinks = 0;
  
  for (const htmlFile of htmlFiles) {
    const htmlContent = fs.readFileSync(htmlFile, 'utf8');
    const links = extractInternalLinks(htmlContent);
    totalLinks += links.length;
    
    if (verbose && links.length > 0) {
      console.log(`📄 ${path.relative(siteDir, htmlFile)}: ${links.length} link(s)`);
    }
    
    for (const link of links) {
      const htmlDir = path.dirname(htmlFile);
      
      // Resolve relative links
      const linkPath = link.startsWith('/') 
        ? path.join(siteDir, link.substring(1))  // Root-relative
        : path.resolve(htmlDir, link);            // Relative to current file
      
      if (!fs.existsSync(linkPath)) {
        brokenLinks.push({
          file: path.relative(siteDir, htmlFile),
          link,
          expectedPath: path.relative(siteDir, linkPath)
        });
      }
    }
  }
  
  console.log(`✅ Checked ${totalLinks} internal link(s) in ${htmlFiles.length} file(s)\n`);
  
  if (brokenLinks.length > 0) {
    console.log(`❌ Found ${brokenLinks.length} broken link(s):\n`);
    for (const { file, link, expectedPath } of brokenLinks) {
      console.log(`   ${file}:`);
      console.log(`      Broken link: ${link}`);
      console.log(`      Expected file: ${expectedPath}\n`);
    }
  }
  
  return {
    valid: brokenLinks.length === 0,
    broken: brokenLinks,
    stats: {
      htmlFiles: htmlFiles.length,
      totalLinks,
      brokenCount: brokenLinks.length
    }
  };
}

module.exports = { checkLinks };

// CLI support
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.error('Usage: check-links.js <site-directory> [--verbose]');
    console.error('');
    console.error('Example:');
    console.error('  check-links.js ./my-site --verbose');
    process.exit(1);
  }
  
  const siteDir = args[0];
  const verbose = args.includes('--verbose');
  
  if (!fs.existsSync(siteDir)) {
    console.error(`❌ Directory not found: ${siteDir}`);
    process.exit(1);
  }
  
  try {
    const result = checkLinks(siteDir, { verbose });
    
    if (!result.valid) {
      console.log('❌ Link checking failed');
      console.log('\n💡 Fix broken links before deployment:');
      console.log('   1. Fix or remove broken links');
      console.log('   2. Use --force flag to deploy anyway (not recommended)\n');
      process.exit(1);
    }
    
    console.log('✅ Link checking passed!\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Link checking error:', error.message);
    process.exit(1);
  }
}
