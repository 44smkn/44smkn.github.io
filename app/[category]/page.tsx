import { getSortedPostsData } from '@/lib/posts';
import PostCard from '@/components/PostCard';
import { Category } from '@/lib/types';
import { notFound } from 'next/navigation';
import { CATEGORY_DISPLAY_MAP, CATEGORY_DESCRIPTION_MAP, CATEGORY_SLUG_MAP } from '@/lib/constants';


// Inverse map for generation


export function generateStaticParams() {
  return Object.keys(CATEGORY_SLUG_MAP).map((category) => ({
    category: category,
  }));
}

export default async function CategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const targetCategory = CATEGORY_SLUG_MAP[category];

  if (!targetCategory) {
    notFound();
  }

  const allPosts = await getSortedPostsData();
  const categoryPosts = allPosts.filter((post) => post.category === targetCategory);

  return (
    <div className="py-4">
      <div className="mb-4">
        <h2 className="text-2xl font-bold mb-2">{CATEGORY_DISPLAY_MAP[targetCategory]}</h2>
        <p className="text-sm text-gray-500">{CATEGORY_DESCRIPTION_MAP[targetCategory]}</p>
      </div>
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
