import { getSortedPostsData } from '@/lib/posts';
import PostCard from '@/components/PostCard';
import { Category } from '@/lib/types';
import { notFound } from 'next/navigation';

// Mapping from URL slug to internal Category
const CATEGORY_MAP: Record<string, Category> = {
  'software-engineering': 'ソフトウェアエンジニアリング',
  'readings': 'Readings',
  'misc': 'Misc',
};

// Inverse map for generation


export function generateStaticParams() {
  return Object.keys(CATEGORY_MAP).map((category) => ({
    category: category,
  }));
}

export default async function CategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const targetCategory = CATEGORY_MAP[category];

  if (!targetCategory) {
    notFound();
  }

  const allPosts = getSortedPostsData();
  const categoryPosts = allPosts.filter((post) => post.category === targetCategory);

  // Display title mapping
  const DISPLAY_TITLE: Record<Category, string> = {
      'ソフトウェアエンジニアリング': 'ソフトウェアエンジニアリング',
      'Readings': '読んだもの',
      'Misc': '雑記'
  };

  return (
    <div className="py-4">
      <h2 className="text-2xl font-bold mb-8">{DISPLAY_TITLE[targetCategory]}</h2>
      {categoryPosts.length > 0 ? (
        <div className="flex flex-col gap-4">
          {categoryPosts.map((post) => (
            <PostCard key={post.slug} post={post} />
          ))}
        </div>
      ) : (
        <p className="text-gray-500">No posts found in this category.</p>
      )}
    </div>
  );
}
