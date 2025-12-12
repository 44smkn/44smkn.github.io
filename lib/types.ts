export type Category = 'ソフトウェアエンジニアリング' | 'Readings' | 'Misc';

export interface Post {
  slug: string;
  title: string;
  date: string;
  category: Category;
  thumbnail?: string;
  intro: string;
  content: string;
}
