<div class="loader"></div>

<style>
  .loader {
    opacity: 0;
    position: relative;
    animation: fadeIn 0.5s ease-in;
    margin-top: 0.5rem;
    animation-iteration-count: 1;
    animation-fill-mode: forwards;
    animation-delay: 1s;
  }
  .loader:before {
    content: '';
    display: block;
    width: 1.5rem;
    height: 1.5rem;
    background: var(--fg);
    animation: animate 0.5s linear infinite;
    border-radius: 3px;
  }
  .loader:after {
    content: '';
    display: block;
    width: 1.5rem;
    height: 0.25rem;
    background: var(--fg);
    opacity: 0.1;
    position: absolute;
    top: 2.4rem;
    left: 0;
    border-radius: 50%;
    animation: shadow 0.5s linear infinite;
  }
  @keyframes animate {
    17% {
      border-bottom-right-radius: 3px;
    }
    25% {
      transform: translateY(9px) rotate(22.5deg);
    }
    50% {
      transform: translateY(18px) scale(1, 0.9) rotate(45deg);
      border-bottom-right-radius: 1rem;
    }
    75% {
      transform: translateY(9px) rotate(67.5deg);
    }
    100% {
      transform: translateY(0) rotate(90deg);
    }
  }
  @keyframes loader {
    0% {
      left: -100px;
    }
    100% {
      left: 110%;
    }
  }
  @keyframes shadow {
    50% {
      transform: scale(1.2, 1);
    }
  }
</style>
