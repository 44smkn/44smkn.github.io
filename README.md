# 44smkn.github.io

44smknのブログをGitHub Pagesで公開するためのprojectです。

## Overview

このprojectは、markdown形式で記事を管理し、Static Siteとしてbuildされます。link cardや目次の自動生成などの機能を備えています。

## Tech Stack

- **Framework**: [Next.js](https://nextjs.org)
- **Language**: TypeScript
- **Styling**: Tailwind CSS 4.x
- **Markdown processing**: 
  - [remark](https://github.com/remarkjs/remark) - Markdown parser
  - [rehype](https://github.com/rehypejs/rehype) - HTML conversion
  - [remark-link-card](https://github.com/gladevise/remark-link-card) - Link card generation
- **Package manager**: pnpm

## Setup

### Install

```bash
# リポジトリをクローン
git clone https://github.com/44smkn/44smkn.github.io.git
cd 44smkn.github.io

# 依存関係をインストール
pnpm install
```

### Run development server

```bash
pnpm dev
```

ブラウザで [http://localhost:3000](http://localhost:3000) を開いて確認できます。

## How to create a new post

### Create a new post

`_posts`ディレクトリに新しいマークダウンファイル（`.md`）を作成します。

```bash
touch _posts/my-new-post.md
```

### Frontmatter

各記事の先頭には、以下のようなfrontmatterを記述します：

```yaml
---
title: '記事のタイトル'
date: '2025-12-08'
category: 'Software Engineering' # または 'Readings', 'Misc'
intro: '記事の概要（optional）'
thumbnail: 'https://example.com/image.jpg' # サムネイル画像URL（optional）
---
```

- `intro`を省略した場合、本文の最初の段落が自動的に概要として使用されます。

### Special syntax

#### link card

URLをカード形式で表示できます：

```markdown
[https://github.com:card]
```

#### contents

記事内に`[:contents]`と記述すると、その位置にh2/h3レベルの見出しから自動生成された目次が表示されます：

```markdown
[:contents]

## section1
### sub-section1-1

## section2
```

## build and deploy

### build

```bash
pnpm build
```

buildされたファイルは`out`ディレクトリに出力されます。

## project structure

```
.
├── _posts/          # マークダウン形式の記事
├── app/             # Next.js App Router
├── components/      # Reactコンポーネント
├── lib/             # ユーティリティ関数
│   ├── markdown.ts  # マークダウン処理
│   ├── posts.ts     # 記事データ取得
│   └── types.ts     # 型定義
└── public/          # 静的ファイル
```
