/*----------------------------------
- DEPENDANCES
----------------------------------*/

// Npm
import webpack from 'webpack';
import TsAlias from 'ts-alias';
import path from 'path';

// Plugins
var nodeExternals = require('webpack-node-externals');

// Minimizers
const TerserPlugin = require("terser-webpack-plugin");
//var VirtualModulesPlugin = require('webpack-virtual-modules');

// Core
import cli from '@cli';
import createCommonConfig, { TCompileMode, regex } from '../common';

/*----------------------------------
- CONFIG
----------------------------------*/
export default function createCompiler( mode: TCompileMode ): webpack.Configuration {

    console.info(`Creating compiler for server (${mode}).`);
    const dev = mode === 'dev';

    const commonConfig = createCommonConfig('server', mode);

    const { aliases } = cli.paths.aliases.server.forWebpack(cli.paths.app.root + '/node_modules');
        
    const config: webpack.Configuration = {

        ...commonConfig,

        name: 'server',
        target: 'node',
        entry: {
            server: [
                cli.paths.app.root + '/src/server/index.ts',
            ],
        },

        output: {

            pathinfo: dev,

            libraryTarget: 'commonjs2',

            path: cli.paths.app.bin,
            filename: '[name].js',
            publicPath: '/',
            assetModuleFilename: 'public/[hash][ext]',

            chunkFilename: 'chunks/[name].js',
            // HMR
            hotUpdateMainFilename: 'updates/[fullhash].hot-update.json',
            hotUpdateChunkFilename: 'updates/[id].[fullhash].hot-update.js',

        },

        externalsPresets: { node: true }, // in order to ignore built-in modules like path, fs, etc.
        externals: [

            './chunk-manifest.json',
            './asset-manifest.json',

            // node_modules
            function ({ request }, callback) {

                const shouldCompile = request !== undefined && (
                    request[0] === '.'
                    ||
                    request[0] === '/'
                    ||
                    cli.paths.aliases.server.containsAlias(request)
                )

                //console.log('isNodeModule', request, isNodeModule);

                if (!shouldCompile) {
                    
                    // Externalize to a commonjs module using the request path
                    return callback(null, 'commonjs ' + request);
                }

                // Continue without externalizing the import
                callback();
            },
        ],

        resolve: {

            ...commonConfig.resolve,

            alias: {
                ...aliases,
                "@root": cli.paths.app.root,
            },

            extensions: ['.ts', '.tsx', ".json", ".sql"],
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

                        // Dossiers server uniquement pour le bundle server
                        cli.paths.app.root + '/src/server',
                        cli.paths.core.root + '/src/server'
                    ],
                    rules: require('../common/babel')('server', dev)
                }, 

                // Les pages étan tà la fois compilées dans le bundle client et serveur
                // On ne compile les ressources (css) qu'une seule fois (coté client)
                {
                    test: regex.style,
                    loader: 'null-loader'
                },

                ...require('../common/files/images')(dev, false),

                ...require('../common/files/autres')(dev, false),

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

            ...(commonConfig.plugins || [])
        ],

        optimization: {
            minimizer: [
                new TerserPlugin({
                    terserOptions: {
                        // Consere les classnames
                        keep_classnames: true,
                        keep_fnames: true
                    }
                }),
            ]
        },

        // https://webpack.js.org/configuration/devtool/#devtool
        devtool: /*dev 
            ? 'eval-source-map' // Recommended choice for development builds with high quality SourceMaps.
            :*/ 'source-map', // Recommended choice for production builds with high quality SourceMaps.

            // eval-source-map n'est pas précis
        devServer: {
            hot: true,
        },
    };

    return config;
};