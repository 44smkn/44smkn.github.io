interface Props {
  content: string;
}

export default function PostContent({ content }: Props) {
  return (
    <article 
      className="prose prose-gray max-w-none"
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
}
