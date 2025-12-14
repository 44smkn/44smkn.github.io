import { Category } from './types';

export const CATEGORY_DISPLAY_MAP: Record<Category, string> = {
  'Software Engineering': 'Software Engineering',
  'Readings': '読んだもの',
  'Misc': '雑記',
};

export const CATEGORY_DESCRIPTION_MAP: Record<Category, string> = {
  'Software Engineering': '（仕事に関係したりしなかったりする） ソフトウェアエンジニアリング全般に関すること',
  'Readings': '書籍などを読んでの感想/メモ置き場',
  'Misc': '生活に関することとか、長めのツイートみたいなもの',
};

export const CATEGORY_SLUG_MAP: Record<string, Category> = {
  'software-engineering': 'Software Engineering',
  'readings': 'Readings',
  'misc': 'Misc',
};

export const REVERSE_CATEGORY_SLUG_MAP: Record<Category, string> = {
  'Software Engineering': 'software-engineering',
  'Readings': 'readings',
  'Misc': 'misc',
};
