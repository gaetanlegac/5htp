/*----------------------------------
- DEPENDANCES
----------------------------------*/

// Npm
import * as types from '@babel/types'
import type { PluginObj, NodePath } from '@babel/core';
import generate from '@babel/generator';

// Core
import cli from '@cli';
import App, { TAppSide } from '../../../../app';

/*----------------------------------
- WEBPACK RULE
----------------------------------*/

type TOptions = {
    side: TAppSide,
    app: App
}

module.exports = (options: TOptions) => (
    [Plugin, options]
)

const debug = true;

/*----------------------------------
- PLUGIN
----------------------------------*/
function Plugin(babel, { app, side }: TOptions) {

    const t = babel.types as typeof types;

    /*
        - Wrap route.get(...) with (app: Application) => { }
        - Inject chunk ID into client route options
    */

    const plugin: PluginObj<{ 

        filename: string,
        fileType: 'front' | 'back',
        processFile: boolean,

        // Identifier => Name
        importedServices: {[local: string]: string},
        routeDefinitions: types.Expression[]
    }> = {
        pre(state) {

            this.filename = state.opts.filename as string;
            this.processFile = true;
            
            if (
                this.filename.startsWith( cli.paths.appRoot + '/src/client/pages' )
                ||
                this.filename.startsWith( cli.paths.coreRoot + '/src/client/pages' )
            ) {

                this.fileType = 'front';

            } else if (this.filename.startsWith( cli.paths.appRoot + '/src/server/routes' )) {

                this.fileType = 'back';
            
            } else
                this.processFile = false;

            this.importedServices = {}
            this.routeDefinitions = []

        },
        visitor: {

            // Find @app imports
            // Test:            import { router } from '@app';
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

            // Find router definitions
            // Test:            router.xxx()
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
                if (this.fileType === 'front' && callee.object.name === 'router') {

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
                export const __register = ({ router }} => {

                    router.page(..)

                }
            */
            Program: {
                exit: function(path, parent) {

                    const importedServices = Object.entries(this.importedServices);
                    if (importedServices.length === 0)
                        return;

                    let exportValue: types.Expression | types.BlockStatement;
                    if (this.fileType === 'front') {

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