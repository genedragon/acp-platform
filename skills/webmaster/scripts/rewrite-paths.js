#!/usr/bin/env node
/**
 * WebMaster v3 - Asset Path Rewriter
 * Fixes relative paths in HTML to work with any deployment location
 */

const fs = require('fs');
const path = require('path');

/**
 * Rewrite relative asset paths to absolute paths
 * @param {string} htmlContent - HTML file content
 * @param {string} deployPrefix - Deployment prefix (e.g., '' for root, 'site-name' for subdirectory)
 * @returns {string} - Rewritten HTML
 */
function rewriteAssetPaths(htmlContent, deployPrefix = '') {
  const prefix = deployPrefix ? `/${deployPrefix}` : '';
  
  // Patterns to rewrite
  const patterns = [
    // CSS files
    { 
      pattern: /href="(?!http|https|\/\/)([^"]+\.css)"/g,
      replacement: `href="${prefix}/$1"`
    },
    // JavaScript files
    {
      pattern: /src="(?!http|https|\/\/)([^"]+\.js)"/g,
      replacement: `src="${prefix}/$1"`
    },
    // Images
    {
      pattern: /src="(?!http|https|\/\/)([^"]+\.(png|jpg|jpeg|gif|svg|webp))"/g,
      replacement: `src="${prefix}/$1"`
    },
    // Background images in style attributes
    {
      pattern: /url\('(?!http|https|\/\/)([^']+)'\)/g,
      replacement: `url('${prefix}/$1')`
    },
    {
      pattern: /url\("(?!http|https|\/\/)([^"]+)"\)/g,
      replacement: `url("${prefix}/$1")`
    }
  ];

  let rewritten = htmlContent;
  
  for (const { pattern, replacement } of patterns) {
    rewritten = rewritten.replace(pattern, replacement);
  }
  
  // Fix double slashes (if any)
  rewritten = rewritten.replace(/([^:])\/\//g, '$1/');
  
  return rewritten;
}

/**
 * Process all HTML files in a directory
 */
function rewriteDirectory(dirPath, deployPrefix = '', options = {}) {
  const { dryRun = false, verbose = false } = options;
  
  const htmlFiles = [];
  
  function scanDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.name.endsWith('.html')) {
        htmlFiles.push(fullPath);
      }
    }
  }
  
  scanDir(dirPath);
  
  let changedCount = 0;
  
  for (const htmlFile of htmlFiles) {
    const originalContent = fs.readFileSync(htmlFile, 'utf8');
    const rewrittenContent = rewriteAssetPaths(originalContent, deployPrefix);
    
    if (originalContent !== rewrittenContent) {
      changedCount++;
      
      if (verbose) {
        console.log(`✏️  Rewriting: ${path.relative(dirPath, htmlFile)}`);
      }
      
      if (!dryRun) {
        fs.writeFileSync(htmlFile, rewrittenContent, 'utf8');
      }
    }
  }
  
  return { totalFiles: htmlFiles.length, changedFiles: changedCount };
}

module.exports = {
  rewriteAssetPaths,
  rewriteDirectory
};

// CLI support
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.error('Usage: rewrite-paths.js <directory> [--prefix <path>] [--dry-run] [--verbose]');
    console.error('');
    console.error('Examples:');
    console.error('  rewrite-paths.js ./site                    # Root deployment');
    console.error('  rewrite-paths.js ./site --prefix blog      # Subdirectory deployment');
    console.error('  rewrite-paths.js ./site --dry-run          # Preview changes only');
    process.exit(1);
  }
  
  const directory = args[0];
  const prefix = args.find(a => a === '--prefix') ? args[args.indexOf('--prefix') + 1] : '';
  const dryRun = args.includes('--dry-run');
  const verbose = args.includes('--verbose');
  
  if (!fs.existsSync(directory)) {
    console.error(`Error: Directory not found: ${directory}`);
    process.exit(1);
  }
  
  console.log(`Rewriting asset paths in: ${directory}`);
  if (prefix) {
    console.log(`Deployment prefix: /${prefix}`);
  } else {
    console.log(`Deployment: Root (/)`);
  }
  if (dryRun) {
    console.log(`Mode: DRY RUN (no files will be modified)`);
  }
  console.log('');
  
  const result = rewriteDirectory(directory, prefix, { dryRun, verbose });
  
  console.log('');
  console.log(`✅ Processed ${result.totalFiles} HTML file(s)`);
  console.log(`✏️  Modified ${result.changedFiles} file(s)`);
  
  if (dryRun && result.changedFiles > 0) {
    console.log('');
    console.log('Run without --dry-run to apply changes.');
  }
}
