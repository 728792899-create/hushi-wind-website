<template>
  <div class="bg-white text-gray-900 font-sans antialiased min-h-screen flex flex-col">
    <a href="#main-content" class="fixed left-4 top-3 z-[10000] -translate-y-20 rounded-sm bg-black px-4 py-3 text-xs font-bold text-white transition-transform focus:translate-y-0">
      跳到主要内容
    </a>
    <AppHeader />
    
    <main id="main-content" tabindex="-1" class="flex-grow outline-none">
      <slot />
    </main>

    <AppFooter />
  </div>
</template>
