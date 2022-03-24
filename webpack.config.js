const path = require("path");

module.exports = {
  target: "node",
  output: {
    filename: "statsig-node-js.js",
    path: path.resolve(__dirname, 'dist/packed'),
  },
  resolve: {
    fallback: { 
      "zlib": false,
      "crypto": false,
    }
  },
  optimization: {
    minimize: false
  },
};
