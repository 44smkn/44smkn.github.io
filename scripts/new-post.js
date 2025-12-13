#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require('fs');
const path = require('path');

// Get the slug from command line arguments
const args = process.argv.slice(2);
const slug = args[0];

if (!slug) {
  console.error('Error: Please provide a slug for the new post.');
  console.error('Usage: pnpm run new:post <slug>');
  console.error('Example: pnpm run new:post my-new-article');
  process.exit(1);
}

// Get current date in YYYY-MM-DD format
const now = new Date();
const year = now.getFullYear();
const month = String(now.getMonth() + 1).padStart(2, '0');
const day = String(now.getDate()).padStart(2, '0');
const dateStr = `${year}-${month}-${day}`;

// Create filename with date prefix
const filename = `${year}-${month}_${slug}.md`;
const postsDir = path.join(process.cwd(), '_posts');
const filepath = path.join(postsDir, filename);

// Check if file already exists
if (fs.existsSync(filepath)) {
  console.error(`Error: File already exists: ${filepath}`);
  process.exit(1);
}

// Create frontmatter template
const frontmatter = `---
title: ''
date: '${dateStr}'
category: ''
intro: ''
thumbnail: ''
---

## 

`;

// Ensure _posts directory exists
if (!fs.existsSync(postsDir)) {
  fs.mkdirSync(postsDir, { recursive: true });
}

// Write the file
fs.writeFileSync(filepath, frontmatter, 'utf8');

console.log(`✅ Created new post: ${filename}`);
console.log(`📝 File location: ${filepath}`);
console.log('');
console.log('Next steps:');
console.log('1. Edit the frontmatter fields (title, category, intro, thumbnail)');
console.log('2. Write your content below the frontmatter');
console.log('3. Save and preview your post');
