#!/usr/bin/env python3
"""
Generate HTML documentation from Markdown files
"""
import sys
import subprocess
from pathlib import Path

def convert_markdown_to_html(md_file, html_file):
    """Convert a markdown file to HTML using pandoc"""
    try:
        # Use pandoc for conversion with GitHub-flavored markdown
        subprocess.run([
            'pandoc',
            str(md_file),
            '-f', 'gfm',  # GitHub-flavored markdown
            '-t', 'html',
            '-s',  # Standalone HTML document
            '--metadata', f'title=Permissions Vending Machine - {md_file.stem}',
            '--css', 'https://cdn.jsdelivr.net/npm/github-markdown-css@5/github-markdown.min.css',
            '-H', '/dev/stdin',
            '-o', str(html_file)
        ], input=b'''
<style>
  .markdown-body {
    box-sizing: border-box;
    min-width: 200px;
    max-width: 980px;
    margin: 0 auto;
    padding: 45px;
  }
  @media (max-width: 767px) {
    .markdown-body {
      padding: 15px;
    }
  }
  body {
    background-color: #0d1117;
  }
  .markdown-body {
    background-color: #0d1117;
    color: #c9d1d9;
  }
  pre {
    background-color: #161b22 !important;
  }
  code {
    background-color: #161b22 !important;
    color: #79c0ff !important;
  }
</style>
<script>
  // Wrap content in markdown-body class
  window.addEventListener('DOMContentLoaded', function() {
    document.body.innerHTML = '<article class="markdown-body">' + document.body.innerHTML + '</article>';
  });
</script>
''', check=True)
        print(f"✓ Generated: {html_file}")
        return True
    except subprocess.CalledProcessError as e:
        print(f"✗ Failed to convert {md_file}: {e}")
        return False
    except FileNotFoundError:
        print("✗ Error: pandoc not found. Install with: sudo apt-get install pandoc")
        return False

def main():
    project_root = Path(__file__).parent.parent
    docs_dir = project_root / 'docs'
    
    # Files to convert
    files_to_convert = [
        ('architecture.md', 'architecture.html'),
    ]
    
    success_count = 0
    for md_name, html_name in files_to_convert:
        md_file = docs_dir / md_name
        html_file = docs_dir / html_name
        
        if not md_file.exists():
            print(f"✗ Source file not found: {md_file}")
            continue
            
        if convert_markdown_to_html(md_file, html_file):
            success_count += 1
    
    print(f"\nConverted {success_count}/{len(files_to_convert)} files successfully")
    return 0 if success_count == len(files_to_convert) else 1

if __name__ == '__main__':
    sys.exit(main())
