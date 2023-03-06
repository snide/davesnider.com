import { xata } from './xata';
import type { CollectionEntry } from 'astro:content';

const trimExtension = (id: string) => id.replace(/\.[^/.]+$/, '');

export const createXataRecord = async (post: CollectionEntry<'posts'>) => {
  const id = trimExtension(post.id);
  try {
    return await xata.db.search.create(id, {
      astroId: post.id,
      title: post.data.title,
      body: post.body,
      description: post.data.description,
      pubDate: post.data.pubDate
    });
  } catch {
    console.log('error creating xata record');
  }
};

export const updateXataRecord = async (post: CollectionEntry<'posts'>) => {
  const id = trimExtension(post.id);
  try {
    return await xata.db.search.update(id, {
      astroId: post.id,
      title: post.data.title,
      body: post.body,
      description: post.data.description,
      pubDate: post.data.pubDate
    });
  } catch {
    console.log('error updating xata record');
  }
};

/* posts.map(async (post) => {
  const matchingXataRecords = await xata.db.search.filter('astroId', post.id).getAll();
  if (matchingXataRecords.length === 0) {
    createXataRecord(post);
  } else {
    updateXataRecord(post);
  }
}); */

export const syncXataSearch = async (post: CollectionEntry<'posts'>) => {
  const id = trimExtension(post.id);
  const matchingXataRecords = await xata.db.search.filter('id', id).getAll();
  if (matchingXataRecords.length === 0) {
    createXataRecord(post);
  } else {
    updateXataRecord(post);
  }
};
