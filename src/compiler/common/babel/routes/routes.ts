/*----------------------------------
- DEPENDANCES
----------------------------------*/

// Npm
import * as types from '@babel/types'
import type { PluginObj, NodePath } from '@babel/core';
import generate from '@babel/generator';

// Core
import cli from '@cli';
import { App, TAppSide } from '../../../../app';

/*----------------------------------
- WEBPACK RULE
----------------------------------*/

type TOptions = {
    side: TAppSide,
    app: App,
    debug?: boolean
}

module.exports = (options: TOptions) => (
    [Plugin, options]
)

/*----------------------------------
- PLUGIN
----------------------------------*/
function Plugin(babel, { app, side, debug }: TOptions) {

    const t = babel.types as typeof types;

    /*
        - Wrap route.get(...) with (app: Application) => { }
        - Inject chunk ID into client route options
    */

    const plugin: PluginObj<{ 

        filename: string,
        part: 'routes',
        side: 'front' | 'back',
        processFile: boolean,

        // Identifier => Name
        importedServices: {[local: string]: string},
        routeDefinitions: types.Expression[]
    }> = {
        pre(state) {

            this.filename = state.opts.filename as string;
            this.processFile = true;

            // Relative path
            let relativeFileName: string | undefined;
            if (this.filename.startsWith( cli.paths.appRoot ))
                relativeFileName = this.filename.substring( cli.paths.appRoot.length );
            if (this.filename.startsWith( cli.paths.coreRoot ))
                relativeFileName = this.filename.substring( cli.paths.coreRoot.length );
            if (this.filename.startsWith('/node_modules/5htp-core/'))
                relativeFileName = this.filename.substring( '/node_modules/5htp-core/'.length );
            
            // The file isn't a route definition
            if (relativeFileName === undefined) {
                this.processFile = false;
                return false;
            }
            
            // Differenciate back / front
            if (relativeFileName.startsWith('/src/client/pages')) {

                this.side = 'front';
                this.part = 'routes';

            } else if (relativeFileName.startsWith('/src/server/routes')) {

                this.side = 'back';
                this.part = 'routes';

             } else 
                this.processFile = false;

            // Init output
            this.importedServices = {}
            this.routeDefinitions = []
        },
        visitor: {

            // Find @app imports
            // Test:            import { Router } from '@app';
            // Replace by:      nothing
            ImportDeclaration(path) {

                if (!this.processFile)
                    return;
                
                if (path.node.source.value !== '@app')
                    return;

                for (const specifier of path.node.specifiers) {
                    
                    if (specifier.type !== 'ImportSpecifier')
                        continue;

                    if (specifier.imported.type !== 'Identifier')
                        continue;

                    this.importedServices[ specifier.local.name ] = specifier.imported.name;
                }

                // Remove this import
                path.replaceWithMultiple([]);

            },

            // Find Router definitions
            // Test:            Router.xxx()
            // Replace by:      nothing
            CallExpression(path) {

                if (!this.processFile)
                    return;

                // Should be at the root of the document
                if (!(
                    path.parent.type === 'ExpressionStatement'
                    &&
                    path.parentPath.parent.type === 'Program'
                ))
                    return;

                // service.method()
                const callee = path.node.callee
                if (!(
                    callee.type === 'MemberExpression'
                    &&
                    callee.object.type === 'Identifier'
                    &&
                    callee.property.type === 'Identifier'
                    &&
                    (callee.object.name in this.importedServices)
                )) 
                    return;

                // Client route definition: Add chunk id
                let [routePath, ...routeArgs] = path.node.arguments;
                if (this.side === 'front' && callee.object.name === 'Router') {

                    // Inject chunk id in options (2nd arg)
                    const newRouteArgs = injectChunkId(routeArgs, this.filename);
                    if (newRouteArgs === 'ALREADY_PROCESSED')
                        return;

                    routeArgs = newRouteArgs;
                }

                // Force babel to create new fresh nodes
                // If we directy use statementParent, it will not be included in the final compiler code
                const statementParent =
                    t.callExpression(
                        t.memberExpression(
                            t.identifier( callee.object.name ),
                            callee.property,
                        ),
                        [routePath, ...routeArgs]
                    )
                    
                this.routeDefinitions.push( statementParent );

                // Delete this node
                path.replaceWithMultiple([]);
            },

            // Wrap declarations into a exported const app function
            /*  
                export const __register = ({ Router }} => {

                    Router.page(..)

                }
            */
            Program: {
                exit: function(path, parent) {

                    if (!this.processFile)
                        return;

                    const importedServices = Object.entries(this.importedServices);
                    if (importedServices.length === 0)
                        return;

                    let exportValue: types.Expression | types.BlockStatement;
                    if (this.side === 'front') {

                        const routesDefCount = this.routeDefinitions.length;
                        if (routesDefCount !== 1)
                            throw new Error(`Frontend route definition files (/client/pages/**/**.ts) can contain only one route definition. 
                                ${routesDefCount} were given in ${this.filename}.`);

                        exportValue = this.routeDefinitions[0];

                    } else {

                        exportValue = t.blockStatement([
                            // Without spread = react jxx need additionnal loader
                            ...this.routeDefinitions.map( def => 
                                t.expressionStatement(def)
                            ),
                        ])
                    }

                    const exportDeclaration = t.exportNamedDeclaration( 
                        t.variableDeclaration('const', [
                            t.variableDeclarator(
                                t.identifier('__register'),
                                t.arrowFunctionExpression(
                                    [
                                        t.objectPattern(
                                            importedServices.map(([ local, imported ]) => 
                                                t.objectProperty(
                                                    t.identifier( local ),
                                                    t.identifier( imported ),
                                                )
                                            )
                                        )
                                    ], 
                                    exportValue
                                )
                            )
                        ])
                    )

                    // Sans
                    //  console.log('import app via', this.filename, this.importedServices);
                    //debug && console.log( generate(exportDeclaration).code )
                    path.pushContainer('body', [exportDeclaration])
                }
            }
        }
    }

    function injectChunkId( 
        routeArgs: types.CallExpression["arguments"],
        filename: string
    ): types.CallExpression["arguments"] | 'ALREADY_PROCESSED' {

        let [routeOptions, ...otherArgs] = routeArgs;

        const { filepath, chunkId } = cli.paths.getPageChunk(app, filename);
        debug && console.log(`[routes]`, filename, '=>', chunkId);

        const newProperties = [
            t.objectProperty(
                t.identifier('id'),
                t.stringLiteral(chunkId)
            ),
            t.objectProperty(
                t.identifier('filepath'),
                t.stringLiteral(filepath)
            )
        ]

        // No options object
        if (routeOptions.type !== 'ObjectExpression') {
            return [
                t.objectExpression(newProperties),
                ...routeArgs
            ]
        }

        const wasAlreadyProcessed = routeOptions.properties.some( o =>
            o.type === 'ObjectProperty'
            &&
            o.key.type === 'Identifier'
            &&
            o.key.name === 'id'
        )

        if (wasAlreadyProcessed) {
            // Cancel processing
            debug && console.log(`[routes]`, filename, 'Already Processed');
            return 'ALREADY_PROCESSED';
        }

        return [
            t.objectExpression([
                ...routeOptions.properties,
                ...newProperties
            ]),
            ...otherArgs
        ]
    }

    return plugin;
}