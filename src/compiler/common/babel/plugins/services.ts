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
    side: TAppSide
}

const filenamePrefix = cli.paths.appRoot + '/src/server/services';
const processFile = (filename: string) => (
    filename.startsWith( cli.paths.appRoot + '/src/server/services' )
    | 
    filename.startsWith( cli.paths.appRoot + '/src/server/routes' )
)

module.exports = (options: TOptions) => (
    [Plugin, options]
)

const debug = true;

/*----------------------------------
- PLUGIN
----------------------------------*/
function Plugin(babel, { side }: TOptions) {

    const t = babel.types as typeof types;
    let program: NodePath<types.Program>;

    const plugin: PluginObj<{ 

        filename: string,

        appImport: string | null,

        // Identifier => Name
        importedServices: {[identifier: string]: string}
    }> = {
        pre(state) {

            this.filename = state.opts.filename as string;

            this.appImport = null
            this.importedServices = {}

        },
        visitor: {

            Program(path) {
                program = path;
            },

            // Transform imports
            ImportDeclaration(path) {

                if (!this.filename.startsWith( cli.paths.appRoot + '/src/server' ))
                    return;
                
                if (path.node.source.value !== '@server/app')
                    return;

                const importedServices: { local: string, imported: string }[] = []
                let appName: string = 'app';

                for (const specifier of path.node.specifiers) {
                    /*
                        import app from '@server/app';
                    */
                    if (specifier.type === 'ImportDefaultSpecifier') {

                        appName = specifier.local.name;

                    /*
                        import { sql } from '@server/app';
                        => 
                        import app from '@server/app';
                        app.use('sql');
                    */
                    } else if (specifier.type === 'ImportSpecifier') {

                        if (specifier.imported.type !== 'Identifier')
                            continue;

                        importedServices.push({
                            local: specifier.local.name,
                            imported: specifier.imported.name
                        });

                    /*
                        import * as templates from '@server/app';
                        =>

                    */
                    } else if (specifier.type === 'ImportNamespaceSpecifier') {

                        //importDefault = specifier.local.name;
                        //importAll = true;

                    }
                }

                // No service imported
                // This verification avoids ininite loop
                if (importedServices.length === 0)
                    return;

                const replacements: types.Statement[] = [
                    t.importDeclaration(
                        [
                            t.importDefaultSpecifier( t.identifier( appName )),
                        ],
                        t.stringLiteral('@server/app')
                    )
                ]

                for (const { imported, local } of importedServices) {

                    replacements.push(
                        t.expressionStatement(
                            t.callExpression(
                                t.memberExpression(
                                    t.identifier( appName ),
                                    t.identifier('use')
                                ),
                                [
                                    t.stringLiteral( imported )
                                ]
                            )
                        )
                    );

                    this.importedServices[ local ] = imported;
                }

                debug && console.log(`############ [compilation][babel][services] Remplacement: `, 
                    generate(t.program(replacements)).code 
                );

                path.replaceWithMultiple(replacements);
            },

            // transform accesses
            Identifier() {
                
            }
        }
    }

    return plugin;
}