<script lang="ts">
  export let colorsData;

  function rgbColor(colorObj) {
    return `rgb(${colorObj.red}, ${colorObj.green}, ${colorObj.blue})`;
  }

  const totalPixelFraction = colorsData.colors.reduce((sum, colorObj) => sum + colorObj.pixelFraction, 0);

  function widthPercentage(colorObj) {
    return `${(colorObj.pixelFraction / totalPixelFraction) * 100}%`;
  }

  const sortedColors = colorsData.colors.sort((a, b) => b.pixelFraction - a.pixelFraction);
</script>

<div class="colors">
  {#each sortedColors as colorObj (colorObj.score)}
    <div class="color" style="--color: {rgbColor(colorObj.color)}; --width: {widthPercentage(colorObj)}"></div>
  {/each}
</div>

<style>
  .colors {
    display: flex;
    width: 100%;
  }
  .color {
    background-color: var(--color);
    width: var(--width);
    min-width: 0.25rem;
    height: 1.5rem;
  }
</style>
