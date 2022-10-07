/*----------------------------------
- DEPENDANCES
----------------------------------*/

// Npm
import webpack from 'webpack';
import fs from 'fs-extra';

// Plugins
const TerserPlugin = require('terser-webpack-plugin');
// Optimisations
const BrotliCompression = require("brotli-webpack-plugin");
import CompressionPlugin from "compression-webpack-plugin";
const ImageMinimizerPlugin = require("image-minimizer-webpack-plugin");
const imageminWebp = require('imagemin-webp');
const { extendDefaultPlugins } = require("svgo");
// Ressources
const CssMinimizerPlugin = require("css-minimizer-webpack-plugin");
import MiniCssExtractPlugin from "mini-css-extract-plugin";
import WebpackAssetsManifest from 'webpack-assets-manifest';
// Dev
import PreactRefreshPlugin from '@prefresh/webpack';

// Core
import createCommonConfig, { TCompileMode, regex } from '../common';
import identityAssets from './identite';
import cli from '../..';

/*----------------------------------
- CONFIG
----------------------------------*/
export default function createCompiler(mode: TCompileMode): webpack.Configuration {

    console.info(`Creating compiler for client (${mode}).`);
    const dev = mode === 'dev';

    const commonConfig = createCommonConfig('client', mode);

    // Pas besoin d'attendre que les assets soient générés pour lancer la compilation
    identityAssets();

    // Symlinks to public
    /*const publicDirs = fs.readdirSync(cli.paths.app.root + '/public');
    for (const publicDir of publicDirs)
        fs.symlinkSync( 
            cli.paths.app.root + '/public/' + publicDir,  
            cli.paths.app.public + '/' + publicDir
        );*/

    // Convert tsconfig cli.paths to webpack aliases
    const { aliases } = cli.paths.aliases.client.forWebpack(cli.paths.app.root + '/node_modules');
    // Disable access to server-side libs from client side
    delete aliases["@server"]; 
    delete aliases["@/server"]; 

    const config: webpack.Configuration = {

        ...commonConfig,

        name: 'client',
        target: 'web',
        entry: {
            client: [
                /*...(dev ? [
                    process.env.framework + '/cli/compilation/webpack/libs/webpackHotDevClient.js',
                    // https://github.com/webpack-contrib/webpack-hot-middleware#config
                    cli.paths.core.root + '/node_modules' + '/webpack-hot-middleware/client?name=client&reload=true',
                ] : []),*/
                cli.paths.core.root + '/src/client/index.tsx'
            ]
        },

        output: {

            pathinfo: dev,
            path: cli.paths.app.bin + '/public',
            filename: '[name].js', // Output client.js
            assetModuleFilename: '[hash][ext]',

            chunkFilename: dev
                ? '[name].js'
                : '[id].[hash:8].js'
        },

        resolve: {

            ...commonConfig.resolve,

            alias: aliases,

            // RAPPEL: on a besoin de résoudre les node_modules
            extensions: [".mjs", '.ts', '.tsx', ".jsx", ".js", ".json", ".sql"],
        },

        module: {
            // Make missing exports an error instead of warning
            strictExportPresence: true,

            rules: [
                {
                    test: regex.scripts,
                    include: [

                        cli.paths.app.root + '/src/client',
                        cli.paths.core.root + '/src/client',

                        cli.paths.app.root + '/src/common',
                        cli.paths.core.root + '/src/common',

                    ],
                    rules: require('../common/babel')('client', dev)
                },

                // Les pages étan tà la fois compilées dans le bundle client et serveur
                // On ne compile les ressources (css) qu'une seule fois
                {
                    test: regex.style,
                    rules: require('../common/files/style')(true, dev),

                    // Don't consider CSS imports dead code even if the
                    // containing package claims to have no side effects.
                    // Remove this when webpack adds a warning or an error for this.
                    // See https://github.com/webpack/webpack/issues/6571
                    sideEffects: true,
                },

                ...require('../common/files/images')(dev, true),

                ...require('../common/files/autres')(dev, true),

                // Exclude dev modules from production build
                /*...(dev ? [] : [
                    {
                        test: cli.paths.app.root + '/node_modules/react-deep-force-update/lib/index.js'),
                        loader: 'null-loader',
                    },
                ]),*/
            ],
        },

        plugins: [

            ...(commonConfig.plugins || []),

            new MiniCssExtractPlugin({

            }),
            
            // Emit a file with assets cli.paths
            // https://github.com/webdeveric/webpack-assets-manifest#options
            new WebpackAssetsManifest({
                output: cli.paths.app.root + `/bin/asset-manifest.json`,
                publicPath: true,
                writeToDisk: true, // Force la copie du fichier sur e disque, au lieu d'en mémoire en mode dev
                customize: ({ key, value }) => {
                    // You can prevent adding items to the manifest by returning false.
                    if (key.toLowerCase().endsWith('.map')) return false;
                    return { key, value };
                },
                done: (manifest, stats) => {
                    // Write chunk-manifest.json.json
                    const chunkFileName = cli.paths.app.root + `/bin/chunk-manifest.json`;
                    try {
                        const fileFilter = file => !file.endsWith('.map');
                        const addPath = file => manifest.getPublicPath(file);
                        const chunkFiles = stats.compilation.chunkGroups.reduce((acc, c) => {
                            acc[c.name] = [
                                ...(acc[c.name] || []),
                                ...c.chunks.reduce(
                                    (files, cc) => [
                                        ...files,
                                        ...cc.files.filter(fileFilter).map(addPath),
                                    ],
                                    [],
                                ),
                            ];
                            return acc;
                        }, Object.create(null));
                        fs.writeFileSync(chunkFileName, JSON.stringify(chunkFiles, null, 4));
                    } catch (err) {
                        console.error(`ERROR: Cannot write ${chunkFileName}: `, err);
                        if (!dev) process.exit(1);
                    }
                },
            }),

            ...(dev ? [

                // HMR pour preact
                //new PreactRefreshPlugin(),

            ] : [

                /*new MomentLocalesPlugin({
                    localesToKeep: ['fr'],
                }),*/

                /*new CompressionPlugin({
                    cache: true,
                    minRatio: 0.99
                }),

                new BrotliCompression({
                    algorithm: 'gzip',
                    test: /\.js$|\.css$|\.html$/,
                    threshold: 10240,
                    minRatio: 0.8,
                })*/

                /*new webpack.HashedModuleIdsPlugin({
                    hashFunction: 'sha256',
                    hashDigest: 'hex',
                    hashDigestLength: 20,
                }),*/

                /*new PurgecssPlugin({}),*/
            ]),
        ],

        // https://webpack.js.org/configuration/devtool/#devtool
        devtool: 'source-map',
        /*devServer: {
            hot: true,
        },*/

        optimization: {

            // Code splitting serveur = même que client
            // La décomposition des chunks doit toujours être la même car le rendu des pages dépend de cette organisation

            // https://webpack.js.org/plugins/split-chunks-plugin/#configuration
            splitChunks: {

                // This indicates which chunks will be selected for optimization
                chunks: 'async',
                // Minimum size, in bytes, for a chunk to be generated.
                // Pour les imports async (ex: pages), on crée systématiquemen un chunk séparé
                //      Afin que le css d'une page ne soit appliqué qu'à la page concernée
                minSize: 0,

                cacheGroups: {

                    /*defaultVendors: {
                        test: /[\\/]node_modules[\\/]/,
                        name(module) {
                            const packageName = module.context.match(
                                /[\\/]node_modules[\\/](.*?)([\\/]|$)/,
                            )[1];
                            return `npm.${packageName.replace('@', '')}`;
                        },
                        priority: -10,
                    },*/

                    /*default: {
                        minChunks: 2,
                        priority: -20,
                        reuseExistingChunk: true
                    }*/
                },
            },

            // Production
            ...(dev ? {} : {

                // https://github.com/react-boilerplate/react-boilerplate/blob/master/internals/webpack/webpack.prod.babel.js
                minimize: true,
                removeAvailableModules: true,
                minimizer: [
                    new TerserPlugin({
                        terserOptions: {
                            parse: {
                                // We want terser to parse ecma 8 code. However, we don't want it
                                // to apply any minification steps that turns valid ecma 5 code
                                // into invalid ecma 5 code. This is why the 'compress' and 'output'
                                // sections only apply transformations that are ecma 5 safe
                                // https://github.com/facebook/create-react-app/pull/4234
                                ecma: 8,
                            },
                            compress: {
                                ecma: 5,
                                warnings: false,
                                // Disabled because of an issue with Uglify breaking seemingly valid code:
                                // https://github.com/facebook/create-react-app/issues/2376
                                // Pending further investigation:
                                // https://github.com/mishoo/UglifyJS2/issues/2011
                                comparisons: false,
                                // Disabled because of an issue with Terser breaking valid code:
                                // https://github.com/facebook/create-react-app/issues/5250
                                // Pending further investigation:
                                // https://github.com/terser-js/terser/issues/120
                                inline: 2,
                            },
                            mangle: {
                                safari10: true,
                            },
                            output: {
                                ecma: 5,
                                comments: false,
                                // Turned on because emoji and regex is not minified properly using default
                                // https://github.com/facebook/create-react-app/issues/2488
                                ascii_only: true,
                            },
                        }
                    }),

                    ...(dev ? [] : [
                        new CssMinimizerPlugin()
                    ]),

                    // BUG: Essai de charger les plugins depuis app/node_modules
                    //      Et la specification via require() ne sembl epas être supportée ...
                    // https://webpack.js.org/plugins/image-minimizer-webpack-plugin/
                    /*new ImageMinimizerPlugin({
                        generator: [
                            {
                                // You can apply generator using `?as=webp`, you can use any name and provide more options
                                preset: "webp",
                                implementation: ImageMinimizerPlugin.imageminGenerate,
                                options: {
                                    // Please specify only one plugin here, multiple plugins will not work
                                    plugins: ["imagemin-webp"],
                                },
                            },
                        ],
                    }),*/
                ],
                nodeEnv: 'production',
                sideEffects: true,
            }),

        },
    };

    return config;
};