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

/**
 * Extended source type: now includes "models"
 * so we can differentiate how we rewrite references.
 */
type TImportSource = 'container' | 'application' | 'models';

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
          import { MyModel } from '@models';
          ...
          MyService.method();
          Environment.name;
          MyModel.someCall();
  
        To:
          import container from '<path>/server/app/container';
          ...
          container.Environment.name;
          this.app.MyService.method();
          this.app.Models.client.MyModel.someCall();
  
        Processed files:
          @/server/config
          @/server/routes
          @/server/services
    */

    const plugin: PluginObj<{

        debug: boolean,

        filename: string,
        processFile: boolean,

        // Count how many total imports we transform
        importedCount: number,

        // For every local identifier, store info about how it should be rewritten
        importedReferences: {
            [localName: string]: {
                imported: string,                // The original “imported” name
                bindings: any,                   // reference paths
                source: TImportSource            // container | application | models
            }
        }

        // Tally how many references per kind
        bySource: { [s in TImportSource]: number }
    }> = {

        pre(state) {
            this.filename = state.opts.filename as string;
            this.processFile = (
                this.filename.startsWith(cli.paths.appRoot + '/server/config')
                ||
                this.filename.startsWith(cli.paths.appRoot + '/server/services')
            );

            this.importedReferences = {};
            this.bySource = {
                container: 0,
                application: 0,
                models: 0
            };
            this.importedCount = 0;
            this.debug = debug || false;
        },

        visitor: {

            /**
             * Detect import statements from '@app' or '@models'
             */
            ImportDeclaration(path) {
                if (!this.processFile) return;

                const source = path.node.source.value;
                if (source !== '@app' && source !== '@models') {
                    return;
                }

                // For '@app' and '@models', gather imported symbols
                for (const specifier of path.node.specifiers) {
                    if (specifier.type !== 'ImportSpecifier') continue;
                    if (specifier.imported.type !== 'Identifier') continue;

                    this.importedCount++;

                    let importSource: TImportSource;
                    if (source === '@app') {
                        // Distinguish whether it's a container service or an application service
                        if (app.containerServices.includes(specifier.imported.name)) {
                            importSource = 'container';
                        } else {
                            importSource = 'application';
                        }
                    } else {
                        // source === '@models'
                        importSource = 'models';
                    }

                    this.importedReferences[specifier.local.name] = {
                        imported: specifier.imported.name,
                        bindings: path.scope.bindings[specifier.local.name].referencePaths,
                        source: importSource
                    };

                    this.bySource[importSource]++;
                }

                // Remove the original import line(s) and replace with any needed new import
                // For @app imports, we might import "container" if needed
                // For @models, we don’t import anything
                const replaceWith: any[] = [];

                // If this line had container references, add a default import for container
                // Example: import container from '<root>/server/app/container'
                if (source === '@app' && this.bySource.container > 0) {
                    replaceWith.push(
                        t.importDeclaration(
                            [t.importDefaultSpecifier(t.identifier('container'))],
                            t.stringLiteral(
                                cli.paths.core.root + '/server/app/container'
                            )
                        )
                    );
                }

                // Replace the original import statement with our new import(s) if any
                // or remove it entirely if no container references exist.
                path.replaceWithMultiple(replaceWith);
            },

            /**
             * Rewrite references to the imports
             */
            Identifier(path) {
                if (!this.processFile || this.importedCount === 0) {
                    return;
                }

                const name = path.node.name;
                const ref = this.importedReferences[name];
                if (!ref || !ref.bindings) {
                    return;
                }

                // Find a specific binding that hasn't been replaced yet
                let foundBinding = undefined;
                for (const binding of ref.bindings) {
                    if (!binding.replaced && path.getPathLocation() === binding.getPathLocation()) {
                        foundBinding = binding;
                        break;
                    }
                }
                if (!foundBinding) {
                    return;
                }

                // Mark as replaced to avoid loops
                foundBinding.replaced = true;

                // Based on the source, replace the identifier with the proper MemberExpression
                if (ref.source === 'container') {
                    // container.[identifier]
                    // e.g. container.Environment
                    path.replaceWith(
                        t.memberExpression(
                            t.identifier('container'),
                            path.node
                        )
                    );
                }
                else if (ref.source === 'application') {
                    // this.app.[identifier]
                    // e.g. this.app.MyService
                    path.replaceWith(
                        t.memberExpression(
                            t.memberExpression(
                                t.thisExpression(),
                                t.identifier('app')
                            ),
                            path.node
                        )
                    );
                }
                else if (ref.source === 'models') {
                    // this.app.Models.client.[identifier]
                    // e.g. this.app.Models.client.MyModel
                    path.replaceWith(
                        t.memberExpression(
                            t.memberExpression(
                                t.memberExpression(
                                    t.memberExpression(
                                        t.thisExpression(),
                                        t.identifier('app')
                                    ),
                                    t.identifier('Models')
                                ),
                                t.identifier('client')
                            ),
                            path.node
                        )
                    );
                }
            }
        }
    };

    return plugin;
}
