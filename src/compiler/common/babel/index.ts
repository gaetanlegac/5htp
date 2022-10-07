/*----------------------------------
- DEPENDANCES
----------------------------------*/

// Npm
import path from 'path';
import type webpack from 'webpack';
import * as types from '@babel/types'

// Core
import PluginIndexage from '../plugins/indexage';
import BabelGlobImports from './plugins/importations';

import cli from '../../..';
import { TAppSide } from '../../..';

// Const
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// Resources
const routesToPreload = require( cli.paths.appRoot + '/src/client/pages/preload.json' );

/*----------------------------------
- REGLES
----------------------------------*/
module.exports = (side: TAppSide, dev: boolean): webpack.RuleSetRule[] => ([{
    loader: 'babel-loader',
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
            [require('@babel/preset-env'), side === 'client' ? {

                // Ajoute automatiquement les polyfills babel
                // https://stackoverflow.com/a/61517521/12199605
                "useBuiltIns": "usage", // alternative mode: "entry"
                "corejs": 3, // default would be 2

                targets: {
                    browsers: cli.pkg.app.browserslist,
                },
                forceAllTransforms: !dev, // for UglifyJS
                modules: false,
                debug: false,
            } : {
                targets: {
                    node: true,//pkg.engines.node.match(/(\d+\.?)+/)[0],
                },
                modules: false,
                useBuiltIns: false,
                debug: false,
            }],

            [require("@babel/preset-typescript"), {
                useDefineForClassFields: true,
                //jsxPragma: "h"
            }],

            // JSX
            // https://github.com/babel/babel/tree/master/packages/babel-preset-react
            [require('@babel/preset-react'), {
                //pragma: "h"
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

                    // HMR Preact avec support des hooks
                    //['@prefresh/babel-plugin'],

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
                }]
            ]),

            BabelGlobImports({ 
                debug: false,
                removeAliases: (source: string) => cli.paths.withoutAlias(source, side)
            }, [{
                test: (request) => {
                    if (request.source === '@models') {
                        request.source = cli.paths.app.src + '/server/models/**/*.ts';
                        return true;
                    }
                    return false;
                },
                replace: (request, matches, t) => {
                    // Preserve default behavior
                }
            }, {
                test: (request) => (
                    side === 'client'
                    &&
                    (
                        request.source === '@/client/pages/**/*.tsx' 
                        || 
                        request.source === '@client/pages/**/*.tsx'
                    )
                    &&
                    request.type === 'import'
                ),
                replace: (request, matches, t) => {

                    if (!('default' in request) || request.default === undefined)
                        return;

                    const imports: types.ImportDeclaration[] = [];

                    // const routes = {
                    //    <chunkId1>: () => import(/* webpackChunkName: '<chunkId>' */ "<file>"),
                    //    <chunkId2>: () => require("<file>").default,
                    // }

                    const pageLoaders: types.ObjectProperty[] = [];
                    for (const file of matches) {

                        // Exclude layouts
                        if (file.filename.includes("/_layout/")) {
                            //console.log("Exclude", file, 'from pages loaders (its a layout)');
                            continue;
                        }

                        // Excliude components
                        const filename = path.basename( file.filename );
                        if (alphabet.includes(filename[0]) && filename[0] === filename[0].toUpperCase()) {
                            //console.log("Exclude", file, 'from pages loaders (its a component)');
                            continue;
                        }
                            
                        // Page config
                        const { chunkId } = cli.paths.getPageChunk(file.filename);
                        const preloadPage = routesToPreload.includes(chunkId);

                        // Import type according to preloading option
                        if (preloadPage) {

                            // import <chunkId> from "<file>";
                            imports.push(
                                t.importDeclaration(
                                    [t.importDefaultSpecifier( t.identifier(chunkId) )],
                                    t.stringLiteral(file.filename)
                                )
                            );

                            // { <chunkId>: <chunkId> }
                            pageLoaders.push(
                                t.objectProperty( 
                                    t.stringLiteral(chunkId),
                                    t.identifier(chunkId)
                                )
                            );

                        } else {

                            // <chunkId>: () => ...
                            pageLoaders.push( 
                                t.objectProperty( 
                                    
                                    t.stringLiteral(chunkId),
                                    // () => import(/* webpackChunkName: '<chunkId>' */ "<file>")
                                    t.arrowFunctionExpression([], t.callExpression(

                                        t.import(), [t.addComment(
                                            t.stringLiteral(file.filename),
                                            "leading",
                                            "webpackChunkName: '" + chunkId + "'"
                                        )]
                                    ))
                                )
                            )
                        }
                    }

                    return [
                        ...imports,
                        // const routes = { ... }
                        t.variableDeclaration("const", [t.variableDeclarator(
                            t.identifier(request.default),
                            t.objectExpression(pageLoaders)
                        )])
                    ]

                }
            }])

        ],

        overrides: [

            require("./plugins/pages")({ side }),

            require("./plugins/models")({ side }),
            
            require('./plugins/icones-svg'),
            
            require('./plugins/form'),

            /*
            
            ...(side === 'client' ? [

            ] : [
                require('./plugins/queries');
                require('./plugins/injection-dependances'),
            ]),

            */
        ]
    }
}])