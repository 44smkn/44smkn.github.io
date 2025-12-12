import { getSortedPostsData } from '@/lib/posts';
import PostCard from '@/components/PostCard';

export default function Home() {
  const allPostsData = getSortedPostsData();

  return (
    <div className="py-4">
      <h2 className="text-2xl font-bold mb-8">Latest Entries</h2>
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
