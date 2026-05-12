<script lang="ts">
  import daveImg from './dave.png';
  import { toggleMode } from 'mode-watcher';

  type Props = {
    isOpen?: boolean;
  };

  let { isOpen = false }: Props = $props();
</script>

<nav id="nav" class="nav" class:nav--open={isOpen}>
  <div class="nav__stickyTop">
    <a class="nav__name" href="/">
      <div class="nav__egg"></div>
      <div class="nav__borderTop"></div>
      <div class="nav__borderRight"></div>
      <div class="nav__borderBot"></div>
      <div class="nav__borderLeft"></div>
      <p class="nav__awesome">CSS is awesome!</p>
      <p class="nav__firstname">Dave</p>
      <p class="nav__lastname"><span>S</span>níd</p>
      <div class="nav__background"></div>
    </a>
    <p class="nav__desc">A chaotic good designer<br />that builds in the browser.</p>
    <ul class="nav__items">
      <li><a href="/">Home</a></li>
      <li><a href="/about">About me</a></li>
      <li><a href="/museum">Museum</a></li>
      <li><a href="/links">Links</a></li>
    </ul>
  </div>
  <div class="nav__stickyBot">
    <img src={daveImg} alt="Dave" width="50" height="50" class="nav__avatar" />
    <ul class="nav__social">
      <li>
        <a href="https://bsky.app/profile/davesnider.com">Bluesky</a>
      </li>
      <li><a href="https://www.youtube.com/@snide">YouTube</a></li>
      <li><a href="https://github.com/snide">Github</a></li>
      <li><a href="mailto:dave.snider@gmail.com">Email</a></li>
      <li><a href="/rss.xml">RSS</a></li>
    </ul>
    <ul class="nav__theme">
      <li>
        <button class="nav__themeToggle" onclick={toggleMode}>Toggle theme</button>
      </li>
    </ul>
  </div>
</nav>

<style>
  .nav {
    display: flex;
    flex-direction: column;
    align-items: start;
    justify-content: space-between;
    padding: 2rem 2rem;
    min-height: 100vh;
  }

  .nav__stickyTop {
    position: sticky;
    top: 2rem;
    z-index: 1;
  }

  .nav__stickyBot {
    position: sticky;
    bottom: 3rem;
    z-index: 1;
  }

  .nav__stickyBot ul {
    font-size: 0.8rem;
  }

  .nav ul {
    display: flex;
    flex-direction: column;
    align-items: start;
    list-style: none;
    gap: 0.5rem;
    margin-top: 1rem;
    width: 100%;
    padding: 0;
    margin-left: 1rem;
  }

  .nav ul li a {
    font-weight: 700;
    padding: 0.1rem 0.2rem;
  }

  .nav ul li a:hover {
    background-color: var(--fg);
    color: var(--bg);
  }

  .nav__name {
    font-family: var(--displayFont);
    text-align: center;
    position: relative;
    display: block;
    color: var(--fg);
    text-decoration: none;
    line-height: 1;
    font-weight: 800;
    padding: 1rem;
    cursor: default !important;
  }

  .nav__name:hover .nav__borderTop,
  .nav__name:hover .nav__borderBot,
  .nav__name:hover .nav__borderLeft,
  .nav__name:hover .nav__borderRight {
    opacity: 1;
    visibility: visible;
    transform: scale(1);
  }

  .nav__borderTop,
  .nav__borderBot,
  .nav__borderLeft,
  .nav__borderRight {
    position: absolute;
    z-index: 3;
    background-color: var(--subtle);
    height: 1px;
    width: 1px;
    transition: all 0.2s ease-out;
    transform: scale(0.2);
  }

  .nav__borderTop {
    top: 0;
    left: -1rem;
    right: -1rem;
    width: calc(100% + 2rem);
    visibility: hidden;
    opacity: 0;
  }

  .nav__borderBot {
    bottom: 0;
    left: -1rem;
    right: -1rem;
    width: calc(100% + 2rem);
    visibility: hidden;
    opacity: 0;
  }

  .nav__borderLeft {
    left: 0;
    top: -1rem;
    bottom: -1rem;
    height: calc(100% + 2rem);
    visibility: hidden;
    opacity: 0;
  }

  .nav__borderRight {
    right: 0;
    top: -1rem;
    bottom: -1rem;
    height: calc(100% + 2rem);
    visibility: hidden;
    opacity: 0;
  }

  .nav__awesome {
    visibility: hidden;
    opacity: 0;
    position: absolute;
    right: -50%;
    bottom: 1rem;
    transform: scale(0.5);
    color: OrangeRed;
    font-weight: 400;
    font-family: 'BerkeleyMono';
  }

  .nav__firstname {
    font-size: 1rem;
    text-decoration: none;
    position: absolute;
    top: 1.8rem;
    font-weight: 600;
    left: 4rem;
    z-index: 3;
    pointer-events: none;
    transition: all 0.1s ease-out;
  }

  .nav__lastname {
    font-size: 4rem;
    letter-spacing: 0.1rem;
    line-height: 1;
    position: relative;
    pointer-events: none;
    z-index: 2;
    transition: all 0.1s ease-out;
    transition-delay: 0.02s;
  }

  .nav__lastname span {
    pointer-events: none;
    font-size: 5rem;
    letter-spacing: -0.2rem;
  }

  .nav__name:hover .nav__firstname {
    display: inline-block;
    transform: rotate(-8deg) scale(1.1) translateY(-0.2rem) translateX(-0.1rem);
  }

  .nav__name:hover .nav__lastname {
    display: inline-block;
    transform: rotate(-6deg) translateY(-0.5rem) scale(1);
  }

  .nav__name:hover .nav__awesome {
    visibility: visible;
    opacity: 1;
    transform: translateX(-50%) rotate(-6deg) translateY(-0.5rem) scale(1);
    transition: all 0.1s ease-out;
    transition-delay: 0.2s;
  }

  .nav__desc {
    color: var(--subtle);
    font-size: 1rem;
    padding: 2rem 0 1rem 0;
    padding-left: 1rem;
  }

  .nav__themeToggle {
    cursor: pointer;
    color: var(--bg);
    background: var(--fg);
    padding: 0 0.25rem;
    border: none;
    font-family: inherit;
    font-size: inherit;
    font-weight: 700;
  }

  .nav__themeToggle:hover {
    text-decoration: underline;
  }

  .nav__theme {
    padding-top: 2rem;
  }

  .nav__avatar {
    border-radius: 50%;
    border: 4px solid var(--fg);
    margin-left: 1rem;
  }

  @media (max-width: 768px) {
    .nav {
      visibility: hidden;
      background-color: var(--navBg);
      display: flex;
      padding: 1rem;
      position: fixed;
      top: 52px;
      left: 0;
      right: 0;
      bottom: 0;
      overflow: auto;
      z-index: 2;
      opacity: 0;
      border-top: 1px solid var(--bg);
      transition: all 0.1s ease-in-out;
      transform: translateY(-2rem);
      min-height: calc(100vh - 52px);
      max-height: calc(100vh - 52px);
    }

    .nav--open {
      visibility: visible;
      opacity: 1;
      transform: translateY(0);
    }

    .nav__items {
      font-size: 2rem;
    }

    .nav__name {
      display: none;
    }

    .nav__desc {
      padding-top: 0;
    }
  }
</style>
