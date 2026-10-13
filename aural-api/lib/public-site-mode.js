const publicSiteMode = (value) => {
  const mode = value === undefined ? 'full' : value;
  if (!['full', 'starter'].includes(mode)) {
    throw new Error('PUBLIC_SITE_MODE must be full or starter');
  }
  return mode;
};

// This only narrows the anonymous surface. Authenticated requests still pass
// through their original route-level permission and version checks.
const starterPublicRequestAllowed = (method, requestPath) => {
  if (['GET', 'HEAD'].includes(method)) {
    return /^\/(?:config|articles(?:\/[1-9]\d*)?|auth\/session)\/?$/.test(requestPath);
  }
  return method === 'POST' && /^\/auth\/(?:login|refresh)\/?$/.test(requestPath);
};

const publicStarterConfig = (config) => ({
  heroImageUrl: config.heroImageUrl,
  aboutTitle: config.aboutTitle,
  aboutText: config.aboutText,
});

module.exports = { publicSiteMode, starterPublicRequestAllowed, publicStarterConfig };
