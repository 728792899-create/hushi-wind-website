export default defineNuxtPlugin((nuxtApp) => {
  const markReady = () => {
    document.documentElement.dataset.hydrated = 'true'
    window.dispatchEvent(new CustomEvent('hushi:hydrated'))
  }

  nuxtApp.hook('app:mounted', markReady)
})
