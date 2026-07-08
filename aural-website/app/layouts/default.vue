<template>
  <div class="bg-white text-gray-900 font-sans antialiased min-h-screen flex flex-col">
    <AppHeader />
    
    <main class="flex-grow">
      <slot />
    </main>

    <AppFooter />
  </div>
</template>