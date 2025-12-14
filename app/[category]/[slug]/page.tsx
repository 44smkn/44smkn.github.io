import { getSortedPostsData, getPostData } from '@/lib/posts';
import { Metadata } from 'next';
import PostContent from '@/components/PostContent';
import { Category } from '@/lib/types';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { CATEGORY_DISPLAY_MAP, REVERSE_CATEGORY_SLUG_MAP } from '@/lib/constants';


export async function generateStaticParams() {
  const posts = await getSortedPostsData();
  return posts.map((post) => ({
    category: REVERSE_CATEGORY_SLUG_MAP[post.category],
    slug: post.slug,
  }));
}

export async function generateMetadata({ params }: { params: Promise<{ category: string; slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPostData(slug);

  if (!post) {
    return {
      title: 'Post Not Found',
    };
  }

  const title = post.title;
  const description = post.intro || 'No description available';
  const images = post.thumbnail ? [post.thumbnail] : [];

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'article',
      publishedTime: post.date,
      images,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images,
    },
  };
}

export default async function PostPage({ params }: { params: Promise<{ category: string; slug: string }> }) {
  const { category, slug } = await params;
  
  const post = await getPostData(slug);

  if (!post) {
    notFound();
  }
  
  // Optional: check if category matches
  if (REVERSE_CATEGORY_SLUG_MAP[post.category] !== category) {
      notFound();
  }

  return (
    <article className="py-10">
      <header className="mb-10">
        <div className="flex items-center gap-2 mb-4 text-sm">
            <Link href={`/${category}`} className="font-bold text-gray-500 hover:text-black">
             {CATEGORY_DISPLAY_MAP[post.category]}
            </Link>
            <span className="text-gray-300">/</span>
            <span className="text-gray-400">{post.date}</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-bold leading-tight mb-6">
            {post.title}
        </h1>
      </header>
      
      <PostContent content={post.content} />

    </article>
  );
}
