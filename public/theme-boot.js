// Applies the saved theme before first paint to avoid a flash of the default theme.
(() => {
  try {
    const settings = JSON.parse(localStorage.getItem('scrivus-settings') || '{}')
    const themes = new Set([
      'dark',
      'light',
      'contrastLight',
      'contrastDark',
      'lavenderLight',
      'lavenderDark',
      'mintLight',
      'mintDark',
      'roseLight',
      'roseDark',
      'skyLight',
      'skyDark',
      'neonCyber',
      'neonViolet',
      'neonEmber',
      'neonLagoon',
    ])
    document.documentElement.dataset.theme = themes.has(settings.theme) ? settings.theme : 'dark'
  } catch {
    document.documentElement.dataset.theme = 'dark'
  }
})()
