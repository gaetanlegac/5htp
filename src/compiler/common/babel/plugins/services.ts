/*----------------------------------
- DEPENDANCES
----------------------------------*/

// Npm
import * as types from '@babel/types'
import type { PluginObj } from '@babel/core';

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

type TImportSource = 'container' | 'application';

module.exports = (options: TOptions) => (
    [Plugin, options]
)


/*----------------------------------
- PLUGIN
----------------------------------*/
function Plugin(babel, { app, side, debug }: TOptions) {

    const t = babel.types as typeof types;

    /*
        Transforms:
            import { MyService, Environment } from '@app';
            ...
            MyService.method()
            Environment.name

        To:
            import app from '@app';
            import Container from '@server/app/container';
            ...
            app.services.MyService.method()
            Container.Environment.name   
            
        Processed files:
            @/server/config
            @/server/routes
            @/server/services
    */

    const plugin: PluginObj<{ 

        debug: boolean,

        filename: string,
        processFile: boolean,

        // Identifier => Name
        importedServicesCount: number,
        importedServices: {
            [local: string]: {
                imported: string,
                bindings: any, // TODO: Scope.Binding[] type
                source: TImportSource
            }
        },
        bySource: {[importSource in TImportSource] : number}
    }> = {
        pre(state) {

            this.filename = state.opts.filename as string;
            this.processFile = (
                this.filename.startsWith( cli.paths.appRoot + '/src/server/config' )
                ||
                this.filename.startsWith( cli.paths.appRoot + '/src/server/routes' )
                ||
                this.filename.startsWith( cli.paths.appRoot + '/src/server/services' )
            )

            this.importedServices = {}
            this.bySource = {
                container: 0,
                application: 0
            }
            this.importedServicesCount = 0
            this.debug = debug || false;

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

                    this.importedServicesCount++;

                    let importSource: TImportSource;
                    if (app.containerServices.includes(specifier.imported.name))
                        importSource = 'container';
                    else
                        importSource = 'application';

                    this.importedServices[ specifier.local.name ] = {
                        imported: specifier.imported.name,
                        bindings: path.scope.bindings[ specifier.local.name ].referencePaths,
                        source: importSource
                    }

                    this.bySource[ importSource ]++;
                }

                // Replace by simple import 
                this.debug && console.log("[babel][services] Replace importation");
                const replaceWith: any[] = []

                if (this.bySource.container > 0)
                    replaceWith.push(
                        t.importDeclaration(
                            [t.importDefaultSpecifier( t.identifier('container') )],
                            t.stringLiteral( cli.paths.core.src + '/server/app/container')
                        )
                    );

                if (this.bySource.application > 0)
                    replaceWith.push(
                        t.importDeclaration(
                            [t.importDefaultSpecifier( t.identifier('application') )],
                            t.stringLiteral( cli.paths.core.src + '/server/app/instance')
                        )
                    );

                path.replaceWithMultiple(replaceWith);
            },

            Identifier(path) {

                if (!this.processFile || this.importedServicesCount === 0)
                    return;

                // Get service the identifier makes rfeerence to
                const name = path.node.name;
                const service = this.importedServices[ name ];
                if (service === undefined)
                    return;

                // sometimes not iterable
                if (!service.bindings)
                    return;

                // Replace by app.services.name
                let serviceBinding: any;
                for (const binding of service.bindings) {
                    if (binding.replaced !== true && path.getPathLocation() === binding.getPathLocation()) {
                        
                        serviceBinding = binding;

                        break;
                    }
                }

                // This identifier is a binding to a service
                if (serviceBinding === undefined)
                    return;

                // Replace to reference to app.services.serviceName
                path.replaceWith(
                    t.memberExpression(
                        service.source === 'container'
                            // container.Environment
                            ? t.identifier( service.source )
                            // application.services.Disks
                            : t.memberExpression(
                                t.identifier( service.source ),
                                t.identifier('services'),
                            ),
                        path.node
                    )
                );

                // Avoid circular loop
                serviceBinding.replaced = true;
            }
        }
    }

    return plugin;
}