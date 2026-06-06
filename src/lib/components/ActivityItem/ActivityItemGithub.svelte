<script lang="ts">
  import type { SelectActivityGithub } from '$db/schema';
  import ActivityItem from './ActivityItem.svelte';
  import { marked } from 'marked';
  import DOMPurify from 'isomorphic-dompurify';

  const renderer = new marked.Renderer();
  renderer.image = ({ href, title, text }) => {
    const titleAttr = title ? ` title="${title}"` : '';
    return `<a href="${href}" target="_blank" rel="noopener noreferrer"><img src="${href}" alt="${text}"${titleAttr}></a>`;
  };
  marked.use({ renderer });

  interface Props {
    details: SelectActivityGithub;
    timestamp: number;
    isPrivate: boolean;
    isAdmin: boolean;
    onHide: () => void;
  }

  let { details, timestamp, isPrivate, isAdmin, onHide }: Props = $props();

  let isComment = $derived(details.eventType === 'issue_comment');
</script>

<ActivityItem type="github" {timestamp} {isPrivate} {isAdmin} {onHide}>
  <a href="https://github.com/{details.repo}" class="githubBody__repo" target="_blank" rel="noopener noreferrer">
    {details.repo}
  </a>
  <a href={details.url} class="githubBody__title" target="_blank" rel="noopener noreferrer">
    {details.title}
  </a>
  {#if details.commitMessage && (details.eventType === 'issue_comment' || details.eventType === 'pr_opened')}
    <div class="githubBody__reply" class:githubBody__reply--visible={isComment}>
      <span class="githubBody__replyArrow">&curarr;</span>
      <div class="githubBody__message">
        {@html DOMPurify.sanitize(marked(details.commitMessage) as string)}
      </div>
    </div>
  {/if}
</ActivityItem>

<style>
  .githubBody__repo {
    display: block;
    font-family: 'BerkeleyMono', monospace;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--fg);
    text-decoration: none;
  }

  .githubBody__repo:hover {
    text-decoration: underline;
  }

  .githubBody__title {
    font-weight: 600;
    line-height: 1.4;
    color: var(--subtle);
    text-decoration: none;
  }

  .githubBody__title:hover {
    text-decoration: underline;
  }

  .githubBody__reply {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  .githubBody__replyArrow {
    display: none;
    color: var(--subtle);
    font-size: 1rem;
    line-height: 1.6;
    flex-shrink: 0;
  }

  .githubBody__reply--visible .githubBody__replyArrow {
    display: block;
  }

  .githubBody__reply--visible .githubBody__message {
    flex: 1;
    min-width: 0;
  }

  .githubBody__message {
    line-height: 1.6;
  }

  .githubBody__message :global(p) {
    margin: 0.5rem 0;
  }

  .githubBody__message :global(p:first-child) {
    margin-top: 0;
  }

  .githubBody__message :global(p:last-child) {
    margin-bottom: 0;
  }

  .githubBody__message :global(a) {
    color: var(--fg);
    text-decoration: underline;
  }

  .githubBody__message :global(code) {
    font-family: 'BerkeleyMono', monospace;
    background: color-mix(in srgb, var(--fg) 10%, transparent);
    padding: 0.1rem 0.3rem;
    border-radius: 0.25rem;
    font-size: 0.9em;
  }

  .githubBody__message :global(pre) {
    background: color-mix(in srgb, var(--fg) 10%, transparent);
    padding: 1rem;
    border-radius: 0.5rem;
    overflow-x: auto;
    margin: 0.5rem 0;
  }

  .githubBody__message :global(pre code) {
    background: none;
    padding: 0;
  }

  .githubBody__message :global(img) {
    max-width: 100%;
    height: auto;
  }
</style>
