const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const webpack = require('webpack');

module.exports = {
  entry: './index.tsx',
  output: {
    filename: "main.js",
    path: path.resolve(__dirname, "dist"),
  },
  plugins: [
    new HtmlWebpackPlugin({ template: "./index.html" }),
    new webpack.ProvidePlugin({
      // the buffer module exposes the Buffer class as a property
      Buffer: ["buffer", "Buffer"],
    }),
  ],
  mode: "development",
  experiments: {
    asyncWebAssembly: true,
    layers: true,
    syncWebAssembly: true,
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.wasm$/,
        type: "asset/resource",
      },
    ],
  },
  resolve: {
    extensions: [".js", ".ts", ".jsx", ".tsx"],
    fallback: {
      path: require.resolve("path-browserify"),
      fs: false,
    },
  },
};
