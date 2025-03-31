/*----------------------------------
- DEPENDANCES
----------------------------------*/

// Npm
import webpack from 'webpack';
import fs from 'fs-extra';

// Minimizers
const TerserPlugin = require("terser-webpack-plugin");
//var VirtualModulesPlugin = require('webpack-virtual-modules');

// Core
import cli from '@cli';
import createCommonConfig, { TCompileMode, regex } from '../common';

// Type
import type App from '../../app';

/*const getCorePluginsList = (app: App,) => {

    const corePlugins: string[] = [];

    if (fs.existsSync( app.paths.root + '/node_modules' ))
        for (const moduleName of fs.readdirSync( app.paths.root + '/node_modules' ))
            if (moduleName.startsWith('5htp-'))
                corePlugins.push(app.paths.root + '/node_modules/' + moduleName + '/src');

    if (fs.existsSync( cli.paths.core.root + '/node_modules' ))
        for (const moduleName of fs.readdirSync( cli.paths.core.root+ '/node_modules' ))
            if (moduleName.startsWith('5htp-'))
                corePlugins.push(cli.paths.core.root + '/node_modules/' + moduleName + '/src');

    return corePlugins;
}*/

const debug = false;

/*----------------------------------
- CONFIG
----------------------------------*/
export default function createCompiler( app: App, mode: TCompileMode ): webpack.Configuration {

    debug && console.info(`Creating compiler for server (${mode}).`);
    const dev = mode === 'dev';

    const commonConfig = createCommonConfig(app, 'server', mode);
    const { aliases } = app.aliases.server.forWebpack({
        modulesPath: app.paths.root + '/node_modules'
    });

    // We're not supposed in any case to import client services from server
    delete aliases["@client/services"]; 
    delete aliases["@/client/services"];

    debug && console.log(`[${mode}] node_modules dirs:`, commonConfig.resolveLoader?.modules,
        '\nModule aliases for webpack:', aliases);
    const config: webpack.Configuration = {

        ...commonConfig,

        name: 'server',
        target: 'node',
        entry: {
            server: [
                cli.paths.coreRoot + '/server/index.ts'
            ],
        },

        output: {

            pathinfo: dev,

            libraryTarget: 'commonjs2',

            path: app.paths.bin,
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
                    // Local files
                    request[0] === '.' || request[0] === '/'
                    ||
                    // Aliased modules
                    app.aliases.server.containsAlias(request)
                    ||
                    // TODO: 5htp.conf: compile: include
                    // Compile 5HTP modules
                    request.startsWith('5htp-')
                    ||
                    // Compile 5HTP modules
                    request.startsWith('@mantine/') ||
                    request.startsWith('react-number-format') ||
                    request.startsWith('@floating-ui')
                )

                //console.log('isNodeModule', request, isNodeModule);

                if (!shouldCompile) {
                    
                    // Externalize to a commonjs module using the request path
                    return callback(undefined, 'commonjs ' + request);
                }

                // Continue without externalizing the import
                callback();
            },
        ],

        resolve: {

            ...commonConfig.resolve,

            alias: aliases,

            extensions: ['.ts', '.tsx', ".json", ".sql", ".js"],
        },

        module: {
            // Make missing exports an error instead of warning
            strictExportPresence: true,

            rules: [
                {
                    test: regex.scripts,
                    include: [

                        app.paths.root + '/client',
                        cli.paths.core.root + '/client',

                        app.paths.root + '/common',
                        cli.paths.core.root + '/common',

                        // Dossiers server uniquement pour le bundle server
                        app.paths.root + '/server',
                        cli.paths.core.root + '/server',

                        // Complle 5HTP modules so they can refer to the framework instance and aliases
                        // Temp disabled because compile issue on vercel
                        //...getCorePluginsList(app)
                    ],
                    rules: require('../common/babel')(app, 'server', dev)
                }, 

                // Les pages étan tà la fois compilées dans le bundle client et serveur
                // On ne compile les ressources (css) qu'une seule fois (coté client)
                {
                    test: regex.style,
                    loader: 'null-loader'
                },

                ...require('../common/files/images')(app, dev, false),

                ...require('../common/files/autres')(app, dev, false),

                // Exclude dev modules from production build
                /*...(dev ? [] : [
                    {
                        test: app.paths.root + '/node_modules/react-deep-force-update/lib/index.js'),
                        loader: 'null-loader',
                    },
                ]),*/
            ],
        },

        plugins: [

            ...(commonConfig.plugins || [])
        ],

        optimization: {
            minimizer: dev ? [] : [
                new TerserPlugin({
                    terserOptions: {
                        // Consere les classnames
                        //keep_classnames: true,
                        //keep_fnames: true,
                    }
                }),
            ]
        },

        // https://webpack.js.org/configuration/devtool/#devtool
        devtool: dev 
            ? 'eval-source-map' // Recommended choice for development builds with high quality SourceMaps.
            : 'source-map', // Recommended choice for production builds with high quality SourceMaps.

            // eval-source-map n'est pas précis
        /*devServer: {
            hot: true,
        },*/
    };

    return config;
};