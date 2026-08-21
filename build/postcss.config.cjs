module.exports = (ctx) => {
  const isLegacy = ctx.env === 'legacy';

  return {
    plugins: {
      // Convert modern CSS features for older browsers (legacy only).
      'postcss-preset-env': isLegacy ? {
        stage: false,
        features: {
          'logical-properties-and-values': {preserve: false},
          'media-query-ranges': true,
        },
        autoprefixer: false,
      } : false,

      // Flatten CSS custom properties (legacy only).
      'postcss-custom-properties': isLegacy ? {} : false,

      // Vendor prefixes for the target browserslist.
      'autoprefixer': {},

      // Minify.
      'cssnano': {},
    },
  };
};
