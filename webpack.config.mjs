import path from 'node:path';
import { fileURLToPath } from 'node:url';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import webpack from 'webpack';

const root = path.dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile(path.join(root, '.env'));
} catch {
  /* no .env: defaults below */
}

const APP_NAME = process.env.APP_NAME || 'Scanaar';
const API_URL = process.env.API_URL || 'http://localhost:4000';
const WEB_URL = process.env.WEB_URL || 'http://localhost:3000';
const PORT = Number(process.env.PORT || 3001);

/**
 * A plain React app: Babel compiles TSX, PostCSS runs Tailwind, webpack bundles.
 * The browser only ever calls /api/v1 on this app's own origin. In development the dev server
 * forwards it to the API; in production server.mjs does, so login cookies stay first-party.
 */
export default (_env, argv) => {
  const dev = argv.mode !== 'production';
  return {
    entry: './src/main.tsx',
    output: {
      path: path.join(root, 'dist'),
      filename: dev ? 'assets/[name].js' : 'assets/[name].[contenthash:8].js',
      assetModuleFilename: 'assets/[name].[contenthash:8][ext]',
      publicPath: '/',
      clean: true,
    },
    devtool: dev ? 'eval-cheap-module-source-map' : false,
    resolve: {
      extensions: ['.tsx', '.ts', '.js'],
      alias: { '@': path.join(root, 'src') },
    },
    module: {
      rules: [
        {
          test: /\.[jt]sx?$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: [
                ['@babel/preset-env', { targets: 'defaults' }],
                ['@babel/preset-react', { runtime: 'automatic', development: dev }],
                '@babel/preset-typescript',
              ],
            },
          },
        },
        {
          test: /\.css$/,
          use: [dev ? 'style-loader' : MiniCssExtractPlugin.loader, 'css-loader', 'postcss-loader'],
        },
        { test: /\.(woff2?|jpe?g|png|svg)$/, type: 'asset/resource' },
      ],
    },
    plugins: [
      new HtmlWebpackPlugin({ template: './public/index.html', templateParameters: { APP_NAME } }),
      new webpack.DefinePlugin({ 'process.env.APP_NAME': JSON.stringify(APP_NAME), 'process.env.WEB_URL': JSON.stringify(WEB_URL) }),
      ...(dev ? [] : [new MiniCssExtractPlugin({ filename: 'assets/[name].[contenthash:8].css' })]),
    ],
    devServer: {
      port: PORT,
      host: 'localhost',
      historyApiFallback: true,
      hot: false,
      client: { overlay: { warnings: false } },
      proxy: [{ context: ['/api/v1'], target: API_URL, changeOrigin: true }],
    },
    performance: { hints: false },
  };
};
