<template>
  <!-- Bleeds to the screen edges so the first card sits on the page gutter and the row swipes edge to edge. -->
  <div
    class="-mx-gutter snap-x snap-mandatory scroll-px-gutter overflow-x-auto [scrollbar-width:none] md:-mx-gutter-wide md:scroll-px-gutter-wide [&::-webkit-scrollbar]:hidden">
    <div class="flex w-max gap-3 px-gutter md:px-gutter-wide [&>*]:snap-start">
      <slot />
    </div>
  </div>
</template>
