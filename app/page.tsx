import { getSortedPostsData } from '@/lib/posts';
import PostCard from '@/components/PostCard';

export default async function Home() {
  const allPostsData = await getSortedPostsData();

  return (
    <div className="py-4">
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-2">Latest Entries</h2>
        <p className="text-sm text-gray-500">全カテゴリの最新記事一覧</p>
      </div>
      {allPostsData.length > 0 ? (
        <div className="flex flex-col gap-4">
          {allPostsData.map((post) => (
            <PostCard key={post.slug} post={post} />
          ))}
        </div>
      ) : (
        <p className="text-gray-500">No posts found.</p>
      )}
    </div>
  );
}
