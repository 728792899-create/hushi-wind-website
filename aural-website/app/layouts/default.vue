<template>
  <div class="bg-white text-gray-900 font-sans antialiased min-h-screen flex flex-col">
    <a href="#main-content" class="skip-link">跳到主要内容</a>
    <AppHeader />
    
    <main id="main-content" tabindex="-1" class="flex-grow">
      <slot />
    </main>

    <AppFooter />
  </div>
</template>
<style scoped>
.skip-link { position: fixed; top: 0.5rem; left: 0.5rem; z-index: 10001; padding: 0.75rem 1rem; background: #fff; color: #111; transform: translateY(-150%); }
.skip-link:focus { transform: none; }
</style>
