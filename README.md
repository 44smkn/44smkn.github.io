# 44smkn.github.io

Next.jsで構築された個人ブログサイトです。

## 概要

このプロジェクトは、マークダウン形式で記事を管理し、静的サイトとしてビルドできるブログシステムです。リンクカード機能や目次の自動生成など、便利な機能を備えています。

## 技術スタック

- **フレームワーク**: [Next.js](https://nextjs.org) 16.0.7 (App Router)
- **言語**: TypeScript
- **スタイリング**: Tailwind CSS 4.x
- **マークダウン処理**: 
  - [remark](https://github.com/remarkjs/remark) - マークダウンパーサー
  - [rehype](https://github.com/rehypejs/rehype) - HTML変換
  - [remark-link-card](https://github.com/gladevise/remark-link-card) - リンクカード生成
- **パッケージマネージャー**: pnpm

## セットアップ

### 必要な環境

- Node.js 20以上
- pnpm

### インストール

```bash
# リポジトリをクローン
git clone https://github.com/44smkn/44smkn.github.io.git
cd 44smkn.github.io

# 依存関係をインストール
pnpm install
```

### 開発サーバーの起動

```bash
pnpm dev
```

ブラウザで [http://localhost:3000](http://localhost:3000) を開いて確認できます。

## 記事の投稿方法

### 新しい記事を作成

`_posts`ディレクトリに新しいマークダウンファイル（`.md`）を作成します。

```bash
touch _posts/my-new-post.md
```

### フロントマター

各記事の先頭には、以下のようなフロントマターを記述します：

```yaml
---
title: '記事のタイトル'
date: '2025-12-08'
category: 'Software Engineering' # または 'Readings', 'Misc'
intro: '記事の概要（省略可能）'
thumbnail: 'https://example.com/image.jpg' # サムネイル画像URL（省略可能）
---
```

- `intro`を省略した場合、本文の最初の段落が自動的に概要として使用されます。

### 特殊な記法

#### リンクカード

URLをカード形式で表示できます：

```markdown
[https://github.com:card]
```

#### 目次の自動生成

記事内に`[:contents]`と記述すると、その位置にh2/h3レベルの見出しから自動生成された目次が表示されます：

```markdown
[:contents]

## セクション1
### サブセクション1-1

## セクション2
```

## ビルドとデプロイ

### 本番ビルド

```bash
pnpm build
```

ビルドされたファイルは`out`ディレクトリに出力されます。

### リント

```bash
pnpm lint
```

## プロジェクト構成

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

## ライセンス

このプロジェクトは個人ブログとして使用されています。

