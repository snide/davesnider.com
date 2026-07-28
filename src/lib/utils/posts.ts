import type { Component } from 'svelte';

export interface PostMetadata {
  title: string;
  description: string;
  pubDate: string;
  tags: string[];
  image?: string;
  ogImage?: string;
}

export interface PostSummary {
  slug: string;
  metadata: PostMetadata;
}

export interface Post extends PostSummary {
  default: Component;
}

// For listing posts (home page, RSS) - doesn't include the component
export async function getPostSummaries(): Promise<PostSummary[]> {
  const files = import.meta.glob<{ metadata: PostMetadata }>('/src/posts/*.svx', { eager: true });

  const posts = Object.entries(files).map(([path, module]) => {
    const slug = path.split('/').pop()?.replace('.svx', '') ?? '';
    return {
      slug,
      metadata: module.metadata
    };
  });

  return posts.sort((a, b) => new Date(b.metadata.pubDate).getTime() - new Date(a.metadata.pubDate).getTime());
}

// For rendering a single post - includes the component
// Slug matching is case-insensitive; the returned slug is the canonical (file) casing.
export async function getPostBySlug(slug: string): Promise<Post | undefined> {
  const files = import.meta.glob<Post>('/src/posts/*.svx', { eager: true });

  const slugFromPath = (path: string) => path.split('/').pop()?.replace('.svx', '');
  const entries = Object.entries(files);

  const entry =
    entries.find(([path]) => slugFromPath(path) === slug) ??
    entries.find(([path]) => slugFromPath(path)?.toLowerCase() === slug.toLowerCase());

  if (!entry) return undefined;

  const [path, module] = entry;
  return {
    slug: path.split('/').pop()?.replace('.svx', '') ?? '',
    metadata: module.metadata,
    default: module.default
  };
}

// Alias for backwards compatibility
export const getPosts = getPostSummaries;
