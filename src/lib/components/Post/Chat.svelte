<script lang="ts">
  import daveImg from '../Nav/dave.png';

  type Props = {
    title?: string;
    messages: string[];
  };

  let { title, messages }: Props = $props();

  const paragraphs = (message: string) => message.split('\n').filter((line) => line.trim() !== '');
</script>

<div class="chat">
  {#if title}
    <p class="chat__title">{title}</p>
  {/if}
  <div class="chat__messages">
    {#each messages as message, i (i)}
      <div class="chat__message" class:chat__message--user={i % 2 === 0} class:chat__message--bot={i % 2 === 1}>
        {#if i % 2 === 0}
          <img class="chat__avatar" src={daveImg} alt="Dave" width="36" height="36" />
        {:else}
          <span class="chat__avatar chat__avatar--bot" aria-hidden="true">✱</span>
        {/if}
        <div class="chat__bubble">
          {#each paragraphs(message) as paragraph, p (p)}
            <p>{paragraph}</p>
          {/each}
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .chat {
    border: solid 1px var(--shiki-token-border);
    background-color: var(--codeBg);
  }

  .chat__title {
    background-color: var(--shiki-token-border);
    color: var(--fg);
    font-family: var(--codeFont);
    font-weight: 600;
    font-size: 0.8rem;
    padding: 0.5rem 0.75rem;
    margin: 0 !important;
  }

  .chat__title::before {
    content: '❖ ';
    color: var(--subtle);
    margin-right: 0.5rem;
  }

  .chat__messages {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    padding: 1.5rem;
  }

  .chat__message {
    display: flex;
    gap: 0.75rem;
    align-items: flex-start;
    margin: 0 !important;
  }

  .chat__message--user {
    flex-direction: row-reverse;
  }

  .chat__avatar {
    flex-shrink: 0;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 50%;
    border: 2px solid var(--fg);
    margin: 0 !important;
  }

  .chat__avatar--bot {
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: var(--fg);
    color: var(--bg);
    font-size: 1rem;
  }

  .chat__bubble {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    max-width: 75%;
    padding: 0.75rem 1rem;
    font-family: var(--codeFont);
    font-size: 0.875rem;
    line-height: 1.6;
  }

  .chat__message--user .chat__bubble {
    background-color: var(--fg);
    color: var(--bg);
  }

  .chat__message--bot .chat__bubble {
    background-color: var(--navBg);
    color: var(--subtle);
  }

  .chat__bubble p {
    margin: 0 !important;
  }

  @media (max-width: 768px) {
    .chat__messages {
      padding: 1rem;
      gap: 1rem;
    }

    .chat__bubble {
      max-width: 100%;
    }
  }
</style>
