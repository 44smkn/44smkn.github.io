import Link from 'next/link';
import Image from 'next/image';
import { Post } from '@/lib/types';
import { CATEGORY_DISPLAY_MAP, REVERSE_CATEGORY_SLUG_MAP } from '@/lib/constants';

interface Props {
  post: Post;
}

export default function PostCard({ post }: Props) {
  const categorySlug = REVERSE_CATEGORY_SLUG_MAP[post.category];

  return (
    <div className="group mb-8 flex flex-col md:flex-row gap-6 items-start">
      {/* Thumbnail */}
      <Link href={`/${categorySlug}/${post.slug}`} className="block w-full md:w-48 shrink-0">
        {post.thumbnail ? (
          <div className="w-full aspect-video bg-gray-100 relative overflow-hidden rounded-md">
            <Image 
              src={post.thumbnail} 
              alt={post.title} 
              fill
              className="object-cover object-top group-hover:scale-105 transition-transform duration-300"
              sizes="(max-width: 768px) 100vw, 192px"
            />
          </div>
        ) : (
          <div className="w-full aspect-video bg-gray-100 rounded-md flex items-center justify-center text-gray-400 text-xs">
            No Image
          </div>
        )}
      </Link>

      <div className="flex-1 flex flex-col justify-center">
        <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider bg-gray-50 px-2 py-1 rounded">
                {CATEGORY_DISPLAY_MAP[post.category]}
            </span>
            <span className="text-xs text-gray-400">{post.date}</span>
        </div>
        <Link href={`/${categorySlug}/${post.slug}`}>
            <h2 className="text-xl font-bold mb-1.5 group-hover:text-gray-600 transition-colors line-clamp-2">
            {post.title}
            </h2>
        </Link>
        <p className="text-gray-600 text-sm leading-relaxed line-clamp-2">
          {post.intro}
        </p>
      </div>
    </div>
  );
}
