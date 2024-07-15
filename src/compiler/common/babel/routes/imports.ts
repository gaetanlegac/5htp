/*----------------------------------
- DEPENDANCES
----------------------------------*/

// Npm
import type { ImportTransformer } from 'babel-plugin-glob-import';
import * as types from '@babel/types'
import path from 'path';
import generate from '@babel/generator';

// Core
import cli from '@cli';
import type { TAppSide, default as App } from '@cli/app';

// Resources
const routesToPreload = require( cli.paths.appRoot + '/src/client/pages/preload.json' );

/*----------------------------------
- CONFIG
----------------------------------*/

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/*----------------------------------
- TRANSFORMER
----------------------------------*/

module.exports = (app: App, side: TAppSide, dev: boolean): ImportTransformer => ({

    debug: false,

    test: (request) => (
        side === 'client'
        &&
        (
            request.source === '@client/pages/**/([a-z0-9]*).tsx' 
            || 
            request.source === '@/client/pages/**/([a-z0-9]*).tsx'
        )
        &&
        request.type === 'import'
    ),
    replace: (request, matches, t) => {

        if (request.imported.type !== 'all')
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
                
            // Page config
            const { chunkId } = cli.paths.getPageChunk(app, file.filename);
            const preloadPage = routesToPreload.includes(chunkId);

            // Preload = use sync import
            if (preloadPage) {

                // import <chunkId> from "<file>";
                imports.push(
                    t.importDeclaration(
                        [t.importSpecifier(
                            t.identifier(chunkId),
                            t.identifier('__register'),
                        )],
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

            // Otherwise, use async import + chunk name
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
        
        console.log( generate(t.variableDeclaration("const", [t.variableDeclarator(
            t.identifier(request.imported.name),
            t.objectExpression(pageLoaders)
        )])).code );

        return [
            ...imports,
            // const routes = { ... }
            t.variableDeclaration("const", [t.variableDeclarator(
                t.identifier(request.imported.name),
                t.objectExpression(pageLoaders)
            )])
        ]

    }
})