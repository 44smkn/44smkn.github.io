import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { Post, Category } from './types';

const postsDirectory = path.join(process.cwd(), '_posts');

// Helper function to generate intro from markdown content
function generateIntroFromContent(content: string): string {
  // Remove frontmatter if present
  const withoutFrontmatter = content.replace(/^---[\s\S]*?---\n/, '');

  // Remove markdown syntax and get first paragraph
  const lines = withoutFrontmatter.split('\n');
  let intro = '';

  for (const line of lines) {
    let trimmed = line.trim();
    // Remove card links early to check if line becomes empty
    trimmed = trimmed.replace(/\[[^\]]+:card\]/g, '').trim();

    // Skip empty lines, headings, and special markers
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('[:')) {
      continue;
    }
    // Found first paragraph
    intro = trimmed;
    break;
  }

  // Remove markdown formatting (links, bold, italic, etc.)
  intro = intro
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove links
    .replace(/\*\*([^*]+)\*\*/g, '$1')        // Remove bold
    .replace(/\*([^*]+)\*/g, '$1')            // Remove italic
    .replace(/`([^`]+)`/g, '$1');             // Remove code

  // Limit to 200 characters
  if (intro.length > 50) {
    intro = intro.substring(0, 50).trim() + '...';
  } else if (!intro.endsWith('...')) {
    // Always append '...' to indicate continuation unless already present
    intro = intro + '...';
  }

  return intro || 'No description available.';
}

export function getSortedPostsData(): Post[] {
  // Create _posts directory if it doesn't exist (for safety in initial setup)
  if (!fs.existsSync(postsDirectory)) {
    return [];
  }

  const fileNames = fs.readdirSync(postsDirectory);
  const allPostsData = fileNames.map((fileName) => {
    // Remove ".md" from file name to get id
    const slug = fileName.replace(/\.md$/, '');

    // Read markdown file as string
    const fullPath = path.join(postsDirectory, fileName);
    const fileContents = fs.readFileSync(fullPath, 'utf8');

    // Use gray-matter to parse the post metadata section
    const matterResult = matter(fileContents);
    const frontmatter = matterResult.data as { date: string; title: string; category: Category; thumbnail?: string; intro?: string };

    // Auto-generate intro if not provided
    const intro = frontmatter.intro || generateIntroFromContent(matterResult.content);

    // Combine the data with the id
    return {
      slug,
      ...frontmatter,
      intro,
      content: matterResult.content,
    };
  });

  // Sort posts by date
  return allPostsData.sort((a, b) => {
    if (a.date < b.date) {
      return 1;
    } else {
      return -1;
    }
  });
}

import { processMarkdown } from './markdown';

export async function getPostData(slug: string): Promise<Post | null> {
  const fullPath = path.join(postsDirectory, `${slug}.md`);
  if (!fs.existsSync(fullPath)) {
    return null;
  }
  const fileContents = fs.readFileSync(fullPath, 'utf8');
  const matterResult = matter(fileContents);
  const frontmatter = matterResult.data as { date: string; title: string; category: Category; thumbnail?: string; intro?: string };

  // Auto-generate intro if not provided
  const intro = frontmatter.intro || generateIntroFromContent(matterResult.content);

  const contentHtml = await processMarkdown(matterResult.content);

  return {
    slug,
    ...frontmatter,
    intro,
    content: contentHtml,
  };
}

export function getAllPostSlugs() {
  if (!fs.existsSync(postsDirectory)) {
    return [];
  }
  const fileNames = fs.readdirSync(postsDirectory);
  return fileNames.map((fileName) => {
    return {
      params: {
        slug: fileName.replace(/\.md$/, ''),
      },
    };
  });
}
