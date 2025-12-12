import { Category } from './types';

export const CATEGORY_DISPLAY_MAP: Record<Category, string> = {
  'ソフトウェアエンジニアリング': 'ソフトウェアエンジニアリング',
  'Readings': '読んだもの',
  'Misc': '雑記',
};

export const CATEGORY_SLUG_MAP: Record<string, Category> = {
  'software-engineering': 'ソフトウェアエンジニアリング',
  'readings': 'Readings',
  'misc': 'Misc',
};

export const REVERSE_CATEGORY_SLUG_MAP: Record<Category, string> = {
  'ソフトウェアエンジニアリング': 'software-engineering',
  'Readings': 'readings',
  'Misc': 'misc',
};
