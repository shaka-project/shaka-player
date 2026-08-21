const LEGACY_BROWSERS = 'chrome 38, safari 8, firefox 42';
const MODERN_BROWSERS = 'last 2 years';

module.exports = (ctx) => {
  const isLegacy = ctx.env === 'legacy';
  const browsers = isLegacy ? LEGACY_BROWSERS : MODERN_BROWSERS;

  return {
    plugins: {
      // Convert modern CSS features for older browsers (legacy only).
      'postcss-preset-env': isLegacy ? {
        stage: false,
        browsers,
        features: {
          'logical-properties-and-values': {preserve: false},
          'media-query-ranges': true,
        },
        autoprefixer: false,
      } : false,

      // Flatten CSS custom properties (legacy only).
      'postcss-custom-properties': isLegacy ? {} : false,

      // Vendor prefixes for the target browserslist.
      'autoprefixer': {overrideBrowserslist: browsers},

      // Minify.
      'cssnano': {},
    },
  };
};
