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
type TRouteDefinition = {
    definition: types.CallExpression,
    dataFetchers: types.ObjectProperty[],
    contextName?: string
}

type TFileInfos = {
    path: string,
    process: boolean,
    side: 'front'|'back',

    importedServices: {[local: string]: string},
    routeDefinitions: TRouteDefinition[],
}

module.exports = (options: TOptions) => (
    [Plugin, options]
)

const clientServices = ['Router'];
// Others will be called via app.<Service> (backend) or api.post(<path>, <params>) (frontend)

const routerMethods = ['get', 'post', 'put', 'delete', 'patch'];

/*----------------------------------
- PLUGIN
----------------------------------*/
function Plugin(babel, { app, side, debug }: TOptions) {

    //debug = true;

    const t = babel.types as typeof types;

    /*
        - Wrap route.get(...) with (app: Application) => { }
        - Inject chunk ID into client route options
        - Transform api.fetch:
        
        Input:
        const { stats } = api.fetch({
            stats: api.get(...)
        }):

        Output:

        Route.page('/', { data: { stats: api.get(...) } });
        ...
        const stats = page.data.stats;
    */

    const plugin: PluginObj<{ 
        filename: string,
        file: TFileInfos
    }> = {
        pre(state) {
            this.filename = state.opts.filename as string;

            this.file = getFileInfos(this.filename);
        },
        visitor: {
            // Find @app imports
            // Test:            import { Router } from '@app';
            // Replace by:      nothing
            ImportDeclaration(path) {
                
                const shouldTransformImports = this.file.process;
                if (!shouldTransformImports)
                    return;
                
                if (path.node.source.value !== '@app')
                    return;  

                for (const specifier of path.node.specifiers) {
                    
                    if (specifier.type !== 'ImportSpecifier')
                        continue;

                    if (specifier.imported.type !== 'Identifier')
                        continue;

                    const serviceName = specifier.imported.name;

                    if (clientServices.includes(serviceName))
                        this.file.importedServices[ specifier.local.name ] = serviceName;
                    else
                        this.file.importedServices[ specifier.local.name ] = 'app';
                }

                // Remove this import
                path.remove();

            },

            // Transform services service calls
            CallExpression(path) {

                if (!this.file.process)
                    return;

                // object.property()
                const callee = path.node.callee
                if (!(
                    callee.type === 'MemberExpression'
                ))
                    return;

                // Create full path
                const completePath: string[] = [];
                let currCallee: types.MemberExpression = callee;
                while (1) {

                    if (currCallee.property.type === 'Identifier')
                        completePath.unshift(currCallee.property.name);

                    if (currCallee.object.type === 'MemberExpression')
                        currCallee = currCallee.object;
                    else {

                        if (currCallee.object.type === 'Identifier')
                            completePath.unshift(currCallee.object.name);

                        break;
                    }
                }

                // If we actually call a service
                const serviceName = completePath[0];

                /*
                    Router.page: wrap with export const __register = ({ Router }) => Router.page(...)
                */
                if (
                    serviceName === 'Router' 
                    && 
                    callee.property.type === 'Identifier' 
                    && 
                    ['page', 'error', ...routerMethods].includes(callee.property.name)
                ) {

                    // Should be at the root of the document
                    if (!(
                        path.parent.type === 'ExpressionStatement'
                        &&
                        path.parentPath.parent.type === 'Program'
                    ))
                        return;

                    const routeDef: TRouteDefinition = {
                        definition: path.node,
                        dataFetchers: []
                    }

                    // Adjust
                    if (this.file.side === 'front') {
                        transformDataFetchers(path, this, routeDef);
                    }
                        
                    // Add to the list of route definitons to wrap
                    this.file.routeDefinitions.push(routeDef);

                    // Delete the route def since it will be replaced by a wrapper
                    path.replaceWithMultiple([]);

                /* [client] Backend Service calls: Transform to api.post( <method path>, <params> )

                    Events.Create( form.data ).then(res => toast.success(res.message))
                    =>
                    api.post( '/api/events/create', form.data ).then(res => toast.success(res.message))
                */
                } else if (this.file.side === 'front') {
                    
                    const isAService = (
                        serviceName in this.file.importedServices
                        &&
                        serviceName[0] === serviceName[0].toUpperCase()
                    );
                    if(!isAService)
                        return;

                    if (side === 'client') {

                        // Get complete call path
                        const apiPath = '/api/' + completePath.join('/');
                        
                        // Replace by api.post( <method path>, <params> )
                        const apiPostArgs: types.CallExpression["arguments"] = [t.stringLiteral(apiPath)];
                        if (path.node.arguments.length === 1)
                            apiPostArgs.push( path.node.arguments[0] );

                        path.replaceWith(
                            t.callExpression(
                                t.memberExpression(
                                    t.identifier('api'), t.identifier('post')
                                ), apiPostArgs
                            )
                        )
                    } else {

                        // Rebuild member expression from completePath, adding a api prefix
                        let newCallee = t.memberExpression(
                            t.identifier('app'),
                            t.identifier(completePath[0])
                        );
                        for (let i = 1; i < completePath.length; i++) {
                            newCallee = t.memberExpression(
                                newCallee,
                                t.identifier(completePath[i])
                            );
                        }
                        
                        // Replace by app.<service>.<method>(...)
                        path.replaceWith(
                            t.callExpression(
                                newCallee, [...path.node.arguments]
                            )
                        )
                    }
                }
               
            },
            Program: {
                exit(path, parent) {

                    if (!this.file.process)
                        return;
                        
                    const wrappedrouteDefs = wrapRouteDefs( this.file );
                    if (wrappedrouteDefs)
                        path.pushContainer('body', [wrappedrouteDefs])
                }
            }
        }
    }

    function getFileInfos( filename: string ): TFileInfos {

        const file: TFileInfos = {
            process: true,
            side: 'back',
            path: filename,
            importedServices: {},
            routeDefinitions: []
        }

        // Relative path
        let relativeFileName: string | undefined;
        if (filename.startsWith( cli.paths.appRoot ))
            relativeFileName = filename.substring( cli.paths.appRoot.length );
        if (filename.startsWith( cli.paths.coreRoot ))
            relativeFileName = filename.substring( cli.paths.coreRoot.length );
        /*if (filename.startsWith('/node_modules/5htp-core/'))
            relativeFileName = filename.substring( '/node_modules/5htp-core/'.length );*/
        
        // The file isn't a route definition
        if (relativeFileName === undefined) {
            file.process = false;
            return file;
        }
        
        // Differenciate back / front
        if (relativeFileName.startsWith('/client/pages')) {
            file.side = 'front';
        } else if (relativeFileName.startsWith('/server/routes')) {
            file.side = 'back';
        } else 
            file.process = false;

        return file
    }

    function transformDataFetchers( 
        path: NodePath<types.CallExpression>, 
        routerDefContext: PluginObj, 
        routeDef: TRouteDefinition 
    ) {
        path.traverse({
            // api.load => move data fetchers to route.options.data
            // So the router is able to load data before rendering the component
            CallExpression(path) {

                const callee = path.node.callee

                // Detect api.fetch
                if (!(
                    callee.type === 'MemberExpression'
                    &&
                    callee.object.type === 'Identifier'
                    &&
                    callee.property.type === 'Identifier'
                    &&
                    callee.object.name === 'api' 
                    && 
                    callee.property.name === 'fetch'
                ))
                    return;

                /*  Reference data fetchers
                    {
                        stats: api.get(...)
                    }
                */
                routeDef.dataFetchers.push(
                    ...path.node.arguments[0].properties
                );

                /*  Replace the: 
                        const { stats } = api.fetch({
                            stats: api.get(...)
                        })

                    by:
                        const { stats } = context.data.stats;
                */
                path.replaceWith(
                    t.memberExpression(
                        t.identifier( routeDef.contextName || 'context' ),
                        t.identifier('data'),
                    )
                );
            }
        }, routerDefContext);
    }

    function enrichRouteOptions( 
        routeDef: TRouteDefinition,
        routeArgs: types.CallExpression["arguments"],
        filename: string
    ): types.CallExpression["arguments"] | 'ALREADY_PROCESSED' {

        // Extract client route definition arguments
        let routeOptions: types.ObjectExpression | undefined;
        let renderer: types.ArrowFunctionExpression;
        if (routeArgs.length === 1)
            ([ renderer ] = routeArgs);
        else
            ([ routeOptions, renderer ] = routeArgs);

        // Generate page chunk id
        const { filepath, chunkId } = cli.paths.getPageChunk(app, filename);
        debug && console.log(`[routes]`, filename.replace(cli.paths.appRoot + '/client/pages', ''));

        // Create new options to add in route.options
        const newProperties = [
            t.objectProperty(
                t.identifier('id'),
                t.stringLiteral(chunkId)
            ),
            t.objectProperty(
                t.identifier('filepath'),
                t.stringLiteral(filepath)
            ),
        ]

        // Add data fetchers
        if (routeDef.dataFetchers.length !== 0) {

            // (contollerParams) => { stats: api.get(...) }
            const dataFetchersFunc = t.arrowFunctionExpression(
                renderer.params.map( param => t.cloneNode( param )),
                t.objectExpression(
                    routeDef.dataFetchers.map( df => t.cloneNode( df ))
                )
            )

            // Add the data fetchers to options.data
            newProperties.push(
                t.objectProperty(
                    t.identifier('data'),
                    dataFetchersFunc
                )
            );

            // Expose the context variable in the renderer
            exposeContextProperty( renderer, routeDef );
        }

        if (routeOptions?.properties === undefined)
            return [
                t.objectExpression(newProperties),
                renderer
            ]

        // Test if the route options were not already processed
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

        // Create the new options object
        return [
            t.objectExpression([
                ...routeOptions.properties,
                ...newProperties
            ]),
            renderer
        ]
    }

    function exposeContextProperty( 
        renderer: types.ArrowFunctionExpression, 
        routeDef: TRouteDefinition 
    ) {
        const contextParam = renderer.params[0];
        if (contextParam?.type === 'ObjectPattern') {
            
            for (const property of contextParam.properties) {
                if (
                    property.type === 'ObjectProperty' 
                    && 
                    property.key.type === 'Identifier' 
                    && 
                    property.key.name === 'context'
                    &&
                    property.value.type === 'Identifier'
                ) {

                    routeDef.contextName = property.value.name;
                    break;
                }
            }

            if (!routeDef.contextName) {
                routeDef.contextName = 'context';
                contextParam.properties.push(
                    t.objectProperty( t.identifier('context'), t.identifier( routeDef.contextName ) )
                );
            }

        } else if (contextParam?.type === 'Identifier') {
            console.log("routeDef.contextName", routeDef.contextName);
            routeDef.contextName = contextParam.name;
        }
    }

    function wrapRouteDefs( file: TFileInfos ) {

        const importedServicesList = Object.entries(file.importedServices);

        if (file.path.includes('/routes/csm/missions.ts'))
            console.log("--------WRAP ROUTE DEFS", file.path, importedServicesList.length);

        if (importedServicesList.length === 0)
            return;

        const definitions: types.BlockStatement["body"] = [];
        if (file.side === 'front') {

            // Limit to one route def per file
            const routesDefCount = file.routeDefinitions.length;
            if (routesDefCount === 0)
                return;
            else if (routesDefCount > 1)
                throw new Error(`Frontend route definition files (/client/pages/**/**.ts) can contain only one route definition. 
                    ${routesDefCount} were given in ${file.path}.`);

            const routeDef = file.routeDefinitions[0];

            // Client route definition: Add chunk id
            let [routePath, ...routeArgs] = routeDef.definition.arguments;
            const callee = routeDef.definition.callee;

            if (callee.object.name === 'Router') {

                // Inject chunk id in options (2nd arg)
                const newRouteArgs = enrichRouteOptions(routeDef, routeArgs, file.path);
                if (newRouteArgs === 'ALREADY_PROCESSED')
                    return;

                routeArgs = newRouteArgs;
            }

            // Force babel to create new fresh nodes
            // If we directy use statementParent, it will not be included in the final compiler code
            definitions.push( 
                t.returnStatement(
                t.callExpression(
                    t.memberExpression(
                        t.identifier( callee.object.name ),
                            callee.property,
                        ),
                        [routePath, ...routeArgs]
                    )
                )
            )

        } else {

            definitions.push(
                // Without spread = react jxx need additionnal loader
                ...file.routeDefinitions.map( def => 
                    t.expressionStatement(def.definition)
                ),
            )
        }

        /*
            ({ Router, app: { Events } }}) => {
                ...
            }
        */
            const appSpread: types.ObjectProperty[] = []
            const servicesSpread: types.ObjectProperty[] = [
                t.objectProperty(
                    t.identifier('app'),
                    t.identifier('app'),
                )
            ]
            for (const [local, imported] of importedServicesList) {
                if (imported === 'app') 
                    appSpread.push(
                        t.objectProperty(
                            t.identifier(local),
                            t.identifier(local),
                        )
                    )
                else
                    servicesSpread.push(
                        t.objectProperty(
                            t.identifier(local),
                            t.identifier(imported),
                        )
                    )   
            }
            
            // export const __register = ({ Router, app }) => { ... }
            const exportDeclaration = t.exportNamedDeclaration( 
                t.variableDeclaration('const', [
                    t.variableDeclarator(
                        t.identifier('__register'),
                        t.arrowFunctionExpression(
                            [
                                t.objectPattern(servicesSpread)
                            ], 
                            t.blockStatement([
                                // const { Events } = app;
                                t.variableDeclaration('const', [
                                    t.variableDeclarator(
                                        t.objectPattern(appSpread),
                                        t.identifier('app')
                                    )
                                ]),
                                // Router.post(....)
                                ...definitions,
                            ])
                        )
                    )
                ])
            );
                    

        /*(file.path.includes('platform/server/routes/csm/missions.ts')) 
        && console.log( file.path, generate(exportDeclaration).code );*/

        return exportDeclaration;
    }

    return plugin;
}