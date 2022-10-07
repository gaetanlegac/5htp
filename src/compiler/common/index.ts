/*----------------------------------
- DEPENDANCES
----------------------------------*/

// npm
import webpack from 'webpack';
import dayjs from 'dayjs';

// Plugins
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;
import PluginIndexage from './plugins/indexage';
import IconesSvg from './plugins/indexage/icones-svg';
import InjectDeps from './plugins/indexage/injection-dependances';

// Core
import { TAppSide } from '@cli';
import cli from '../..';

/*----------------------------------
- CONSTANTS
----------------------------------*/

export const regex = {
    scripts: /\.(ts|tsx)$/,
    style: /\.(css|less|scss)$/,
    images: /\.(bmp|gif|jpg|jpeg|png|ico|svg)$/, // SVG gérés par SVGR
    fonts: /\.(woff(2)?|ttf|eot)(\?v=\d+\.\d+\.\d+)?$/,
    staticAssetName: /*isDebug ? '[name].[ext].[hash:8]' :*/ '[hash:8][ext]',
}

/*----------------------------------
- TYPES
----------------------------------*/

export type TCompileMode = 'dev' | 'prod'

/*----------------------------------
- BASE CONFIG
----------------------------------*/

export default function createCommonConfig( side: TAppSide, mode: TCompileMode ): webpack.Configuration {

    const dev = mode === 'dev';
    const config: webpack.Configuration = {

        // Project root
        context: cli.paths.app.root,

        mode: dev ? 'development' : 'production',

        resolveLoader: {
            // Recherche des loaders dans framework/node_modules (psinon, webpack cherche dans le projet)
            modules: [
                cli.paths.core.root + '/node_modules'
            ],
            mainFields: ['loader', 'main'],
        },

        plugins: [

            // https://webpack.js.org/plugins/define-plugin/
            new webpack.DefinePlugin({

                __DEV__: dev,
                SERVER: side === 'server',
                BUILD_DATE: JSON.stringify(dayjs().format('YY.MM.DD-HH.mm')),

                CORE_PATH: JSON.stringify(cli.paths.core.root),
                APP_PATH: JSON.stringify(cli.paths.app.root),
                APP_NAME: JSON.stringify(cli.identity.web.title),

            }),

            new PluginIndexage(side === 'client' ? {
                'icones-svg': new IconesSvg,
            } : {
                //'injection-dependances': new InjectDeps,
            }),

            ...(cli.args.analyze === side ? [

                new BundleAnalyzerPlugin({
                    defaultSizes: 'stat',
                    openAnalyzer: false
                }),

            ] : []),



            ...(dev ? [

                // HMR
                //new webpack.HotModuleReplacementPlugin()

            ] : []),

        ],

        resolve: {

            // Empêche le remplatcement des chemins vers les liens symboliques par leur vrai chemin
            // Permet de conserver le chemin des packages enregistrés via npm link
            // Equivalent tsconfig: preserveSymlinks: true
            symlinks: false,

            /*modules: [
                cli.paths.core.root + '/node_modules',
                cli.paths.app.root + '/node_modules',
            ]*/
        },

        // Turn off performance processing because we utilize
        // our own hints via the FileSizeReporter
        performance: false,

        // Don't attempt to continue if there are any errors.
        bail: !dev,

        // When true, Can cause troubles on re-compiling the client side
        // "webpack" The "path" argument must be of type string. Received undefined
        // https://github.com/webpack/webpack/issues/12616
        // Update: Hum it's fixed, just had to update webpack deps
        cache: dev,

        profile: true,

        // Pour bundle-stats
        // https://github.com/relative-ci/bundle-stats/tree/master/packages/cli#webpack-configuration
        stats: {
            cached: dev,
            cachedAssets: dev,
            chunks: dev,
            chunkModules: dev,
            colors: true,
            hash: dev,
            modules: dev,
            reasons: dev,
            timings: true,
            version: dev,
            errorDetails: true
        },

    }

    return config;

}