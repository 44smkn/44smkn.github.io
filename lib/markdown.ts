import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkLinkCard from 'remark-link-card';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import { visit } from 'unist-util-visit';
import { Plugin } from 'unified';
import { Node, Parent } from 'unist';
import { Text, Link, Paragraph, Heading } from 'mdast';

// Custom plugin to transform [URL:card] to a Link node that remark-link-card picks up
const remarkExpandCardSyntax: Plugin = () => {
  return (tree) => {
    // 1. Handle case where URL is already parsed as a Link node (e.g. by remarkGfm autolink)
    visit(tree, 'link', (node: Link, index, parent) => {
      if (!parent || index === undefined) return;
      const parentNode = parent as unknown as { children: Node[] };

      // Check if URL ends with :card
      if (node.url && node.url.endsWith(':card')) {
        // Remove :card from URL
        const cleanUrl = node.url.slice(0, -5);
        node.url = cleanUrl;

        // Update children text if it matches the URL
        if (node.children.length === 1 && node.children[0].type === 'text') {
          const textNode = node.children[0] as Text;
          if (textNode.value.endsWith(':card')) {
            textNode.value = cleanUrl;
          }
        }

        // Mark as card
        if (!node.data) node.data = {};
        if (!node.data.hProperties) node.data.hProperties = {};
        (node.data.hProperties as Record<string, string>)['data-is-card'] = 'true';

        // Check for surrounding brackets [ ] in previous/next nodes
        // This is to support the syntax [URL:card] explicitly
        const prevNode = parentNode.children[index - 1];
        const nextNode = parentNode.children[index + 1];

        if (prevNode && prevNode.type === 'text' && (prevNode as Text).value.trim().endsWith('[')) {
          // Remove the trailing '[' from previous text node
          const text = (prevNode as Text).value;
          const newText = text.substring(0, text.lastIndexOf('['));
          if (newText) {
            (prevNode as Text).value = newText;
          } else {
            // If node becomes empty, we might want to remove it? 
            // But be careful with indices. For safety, just leave empty string or specific cleanup logic.
            // Simplest: just update value. formatting might leave an extra space but usually fine.
            (prevNode as Text).value = '';
          }
        }

        if (nextNode && nextNode.type === 'text' && (nextNode as Text).value.trim().startsWith(']')) {
          // Remove the leading ']' from next text node
          const text = (nextNode as Text).value;
          const closeBracketIndex = text.indexOf(']');
          const newText = text.substring(closeBracketIndex + 1);
          if (newText) {
            (nextNode as Text).value = newText;
          } else {
            (nextNode as Text).value = '';
          }
        }
      }
    });

    // 2. Handle case where URL is still in text (legacy fallback or if GFM disabled)
    visit(tree, 'text', (node: Text, index, parent) => {
      if (!parent || index === undefined) return;
      // Cast parent to ensure we can access children
      const parentNode = parent as unknown as { children: Node[] };

      const regex = /\[(https?:\/\/.+?):card\]/g;
      let match;
      const newNodes: Node[] = [];
      let lastIndex = 0;
      let found = false;

      while ((match = regex.exec(node.value)) !== null) {
        found = true;
        const url = match[1];
        const startIndex = match.index;
        const endIndex = regex.lastIndex;

        // Add text before
        if (startIndex > lastIndex) {
          newNodes.push({
            type: 'text',
            value: node.value.slice(lastIndex, startIndex)
          } as Text);
        }

        // Add Link Card
        newNodes.push({
          type: 'link',
          url: url,
          children: [{ type: 'text', value: url } as Text],
          data: { hProperties: { 'data-is-card': 'true' } } // Mark as intended for card
        } as Link);

        lastIndex = endIndex;
      }

      if (found) {
        // Add remaining text
        if (lastIndex < node.value.length) {
          newNodes.push({
            type: 'text',
            value: node.value.slice(lastIndex)
          } as Text);
        }

        // Replace the original text node with newNodes
        parentNode.children.splice(index, 1, ...newNodes);
        // Return the new index to skip the nodes we just added
        return index + newNodes.length;
      }
    });
  };
};

// Plugin to split paragraphs so that Link Cards become standalone paragraphs
const remarkSplitCardParagraphs: Plugin = () => {
  return (tree) => {
    visit(tree, 'paragraph', (node: Paragraph, index, parent) => {
      if (!parent || index === undefined) return;
      const parentNode = parent as unknown as { children: Node[] };

      // Check if paragraph contains any card link
      const hasCard = node.children.some(child =>
        child.type === 'link' && (child as Link).data?.hProperties?.['data-is-card'] === 'true'
      );

      if (!hasCard) return;

      // Split paragraph
      const newParagraphs: Node[] = [];
      let currentChildren: Node[] = [];

      node.children.forEach(child => {
        const linkChild = child as Link;
        if (child.type === 'link' && linkChild.data?.hProperties?.['data-is-card'] === 'true') {
          // Flush current children to a paragraph if any
          if (currentChildren.length > 0) {
            newParagraphs.push({ type: 'paragraph', children: currentChildren } as Paragraph);
            currentChildren = [];
          }
          // Push the link as its own paragraph
          newParagraphs.push({ type: 'paragraph', children: [child] } as Paragraph);
        } else {
          currentChildren.push(child);
        }
      });

      // Flush remaining
      if (currentChildren.length > 0) {
        newParagraphs.push({ type: 'paragraph', children: currentChildren } as Paragraph);
      }

      // Replace original paragraph with new paragraphs
      parentNode.children.splice(index, 1, ...newParagraphs);
      return index + newParagraphs.length;
    });
  };
};

// Plugin to auto-convert bare URLs to Link nodes (so we can control them)
const remarkAutoLink: Plugin = () => {
  return (tree) => {
    visit(tree, 'text', (node: Text, index, parent) => {
      if (!parent || index === undefined) return;
      const parentNode = parent as Parent;

      // Skip if already inside a link (visitor checks children, but we are at text)
      // Check parent type? If parent is link, stop.
      if ((parent as Node).type === 'link') return;

      const urlRegex = /(https?:\/\/[^\s]+)/g;
      let match;
      const newNodes: Node[] = [];
      let lastIndex = 0;
      let found = false;

      while ((match = urlRegex.exec(node.value)) !== null) {
        // Ensure it's not part of the [URL:card] syntax (which uses brackets)
        // Simple text search: if precceeding char is '[' and following is ':', skip?
        // But ExpandCardSyntax runs BEFORE this.
        // So [URL:card] is already converted to Link node and won't match here (it's not text anymore).
        // Wait, did I order them correctly?
        // ExpandCardSyntax MUST run before AutoLink.

        found = true;
        const url = match[1];
        const startIndex = match.index;
        const endIndex = urlRegex.lastIndex;

        if (startIndex > lastIndex) {
          newNodes.push({ type: 'text', value: node.value.slice(lastIndex, startIndex) } as Text);
        }

        newNodes.push({
          type: 'link',
          url: url,
          children: [{ type: 'text', value: url } as Text]
        } as Link);

        lastIndex = endIndex;
      }

      if (found) {
        if (lastIndex < node.value.length) {
          newNodes.push({ type: 'text', value: node.value.slice(lastIndex) } as Text);
        }
        parentNode.children.splice(index, 1, ...newNodes);
        return index + newNodes.length;
      }
    });
  };
}

// Custom plugin to prevent remark-link-card from processing links NOT marked as cards
const remarkPreventAccidentalCards: Plugin = () => {
  return (tree) => {
    visit(tree, 'paragraph', (node: Paragraph) => {
      // remark-link-card checks if a paragraph has ONLY one child and it is a Link.
      if (node.children.length === 1 && node.children[0].type === 'link') {
        const linkNode = node.children[0] as Link;
        // Check if this link was marked by our ExpandCardSyntax plugin
        // We stored the marker in data.hProperties
        const isCard = linkNode.data?.hProperties?.['data-is-card'] === 'true';

        if (!isCard) {
          // It's a normal link that happens to be on its own line.
          // Prevent card conversion by adding a dummy text node.
          node.children.push({ type: 'text', value: '' } as Text);
        }
      }
    });
  };
};

// Helper function to generate slug from heading text (supports Japanese)
function generateSlug(text: string): string {
  return encodeURIComponent(
    text
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
  );
}

// Helper function to extract text from heading children
function extractHeadingText(heading: Heading): string {
  let text = '';
  visit(heading, 'text', (node: Text) => {
    text += node.value;
  });
  return text;
}

// Plugin to generate table of contents from [:contents] marker
const remarkTableOfContents: Plugin = () => {
  return (tree) => {
    // First pass: collect all h2 and h3 headings
    const headings: Array<{ depth: number; text: string; id: string }> = [];

    visit(tree, 'heading', (node: Heading) => {
      if (node.depth === 2 || node.depth === 3) {
        const text = extractHeadingText(node);
        const id = generateSlug(text);

        headings.push({ depth: node.depth, text, id });

        // Add id to heading for anchor linking
        if (!node.data) {
          node.data = {};
        }
        if (!node.data.hProperties) {
          node.data.hProperties = {};
        }
        (node.data.hProperties as Record<string, unknown>).id = id;
      }
    });

    // Second pass: replace [:contents] with TOC
    visit(tree, 'paragraph', (node: Paragraph, index, parent) => {
      if (!parent || index === undefined) return;
      const parentNode = parent as unknown as { children: Node[] };

      // Check if paragraph contains only [:contents] text
      if (
        node.children.length === 1 &&
        node.children[0].type === 'text' &&
        (node.children[0] as Text).value.trim() === '[:contents]'
      ) {
        if (headings.length === 0) {
          // No headings found, remove the [:contents] marker
          parentNode.children.splice(index, 1);
          return index;
        }

        // Generate TOC HTML
        let tocHtml = '<nav class="table-of-contents">\n<ul>\n';
        let currentDepth = 2;

        headings.forEach((heading, i) => {
          const nextDepth = headings[i + 1]?.depth || 2;

          if (heading.depth === 2) {
            if (currentDepth === 3) {
              tocHtml += '</ul>\n</li>\n';
            }
            tocHtml += `<li><a href="#${heading.id}">${heading.text}</a>`;
            if (nextDepth === 3) {
              tocHtml += '\n<ul>\n';
            } else {
              tocHtml += '</li>\n';
            }
          } else if (heading.depth === 3) {
            tocHtml += `<li><a href="#${heading.id}">${heading.text}</a></li>\n`;
          }

          currentDepth = heading.depth;
        });

        if (currentDepth === 3) {
          tocHtml += '</ul>\n</li>\n';
        }
        tocHtml += '</ul>\n</nav>';

        // Replace [:contents] paragraph with raw HTML node
        const htmlNode = {
          type: 'html',
          value: tocHtml
        };

        parentNode.children.splice(index, 1, htmlNode);
        return index + 1;
      }
    });
  };
};




export async function processMarkdown(content: string): Promise<string> {
  const result = await unified()
    .use(remarkParse)
    .use(remarkExpandCardSyntax)      // 1. Expand [URL:card] -> Link[data-is-card] BEFORE GFM processes URLs
    .use(remarkGfm)                   // 2. Enable GFM features including footnotes
    .use(remarkSplitCardParagraphs)   // 3. Ensure cards are standalone paragraphs
    .use(remarkAutoLink)              // 4. Convert bare URLs to Links (so we can protect them)
    .use(remarkPreventAccidentalCards)// 5. Protect other lone links
    .use(remarkTableOfContents)       // 6. Generate table of contents from [:contents]
    .use(remarkLinkCard, { short: true }) // 7. Convert valid Links to Cards
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(content);

  return result.toString();
}

