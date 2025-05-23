/*----------------------------------
- DEPENDANCES
----------------------------------*/

// Npm
import type webpack from 'webpack';
import PresetBabel, { Options } from '@babel/preset-env';
// Core
import PluginIndexage from '../plugins/indexage';

import cli from '@cli';
import type { TAppSide, App } from '@cli/app';

/*----------------------------------
- REGLES
----------------------------------*/
module.exports = (app: App, side: TAppSide, dev: boolean): webpack.RuleSetRule[] => {

    const babelPresetEnvConfig: Options = side === 'client'  ? {

        // Ajoute automatiquement les polyfills babel
        // https://stackoverflow.com/a/61517521/12199605
        "useBuiltIns": "usage", // alternative mode: "entry"
        "corejs": 3, // default would be 2

        targets: {
            browsers: dev
                ? 'last 2 versions'
                : app.packageJson.browserslist,
        },
        forceAllTransforms: !dev, // for UglifyJS
        modules: false,
        debug: false,
        bugfixes: !dev
    } : {
        targets: {
            node: true,//pkg.engines.node.match(/(\d+\.?)+/)[0],
        },
        modules: false,
        useBuiltIns: false,
        debug: false,
    }

    return [{
        loader: require.resolve('babel-loader'),
        exclude: (filePath) => {
            // 1) If not in "node_modules" at all => transpile it
            if (!filePath.includes('node_modules')) {
                return false;
            }
        
            // 2) If it’s "node_modules/5htp-core" but NOT "node_modules/5htp-core/node_modules",
            //    then transpile. Otherwise, exclude.
            if (
                filePath.includes('node_modules/5htp-core') &&
                !filePath.includes('node_modules/5htp-core/node_modules')
            ) {
                return false;
            }
        
            // 3) Everything else in node_modules is excluded
            return true;
          },
        options: { 
            
            // https://github.com/babel/babel-loader#options

            // ATTENTION: Ne prend pas toujours compte des màj des plugins babel
            cacheDirectory: cli.args.cache === true,
            // Désactive car ralenti compilation
            cacheCompression: false,

            metadataSubscribers: [
                PluginIndexage.metadataContextFunctionName
            ],

            compact: !dev,

            // https://babeljs.io/docs/usage/options/
            babelrc: false,
            presets: [

                // https://github.com/babel/babel-preset-env
                [PresetBabel, babelPresetEnvConfig],

                [require("@babel/preset-typescript"), {
                    useDefineForClassFields: true,
                    //jsxPragma: "h"
                }],

                // JSX
                // https://github.com/babel/babel/tree/master/packages/babel-preset-react
                [require('@babel/preset-react'), {
                    //pragma: "h"
                    development: dev
                }],

            ],
            plugins: [

                // NOTE: On résoud les plugins et presets directement ici
                //      Autrement, babel-loader les cherchera dans projet/node_modules

                [require("@babel/plugin-proposal-decorators"), { "legacy": true }],

                [require('@babel/plugin-proposal-class-properties'), { "loose": true }],

                [require('@babel/plugin-proposal-private-methods'), { "loose": true }],

                // Masque erreur associée à @babel/plugin-proposal-decorators legacy: true
                [require('@babel/plugin-proposal-private-property-in-object'), { "loose": true }],

                ...(dev ? [

                    ...(side === 'client' ? [
                        

                    ] : [])

                ] : [

                    // Les 3 plugins suivants sont tirés de https://github.com/jamiebuilds/babel-react-optimize

                    // Remove unnecessary React propTypes from the production build
                    // https://github.com/oliviertassinari/babel-plugin-transform-react-remove-prop-types
                    [require('babel-plugin-transform-react-remove-prop-types')],
                    // Treat React JSX elements as value types and hoist them to the highest scope
                    // https://github.com/babel/babel/tree/master/packages/babel-plugin-transform-react-constant-elements
                    [require('@babel/plugin-transform-react-constant-elements')],

                    // Pour du tree shaking manuel
                    // https://www.npmjs.com/package/babel-plugin-transform-imports
                    [require("babel-plugin-transform-imports"), {
                        "lodash": {
                            "transform": "lodash/${member}",
                            "preventFullImport": true
                        }
                    }],

                    ...(side === 'client' ? [
                        
                        [require('babel-plugin-transform-remove-console')],

                    ] : [])
                ]),

                require('./routes/routes')({ side, app, debug: false }),

                ...(side === 'client' ? [

                ] : [

                    require('./plugins/services')({ side, app, debug: false }),

                ]),

                // Allow to import multiple fiels with one import statement thanks to glob patterns
                require('babel-plugin-glob-import')({ 
                    debug: false,
                    removeAliases: (source: string) => app.paths.withoutAlias(source, side)
                }, [
                    // Routes imports on frontend side
                    require('./routes/imports')(app, side, dev)
                ])
            ],

            overrides: [

                require('./plugins/icones-svg')(app),
                
                ...(side === 'client' ? [

                ] : [
                    //require('./plugins/queries'),
                    //require('./plugins/injection-dependances'),
                ]),
            ]
        }
    }]
}