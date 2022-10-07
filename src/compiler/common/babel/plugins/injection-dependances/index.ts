/*----------------------------------
- DEPENDANCES
----------------------------------*/

// Npm
import { PluginObj } from '@babel/core';
import * as types from '@babel/types'
var minimatch = require("minimatch")

import cli from '@cli';

/*----------------------------------
- WEBPACK RULE
----------------------------------*/
const globServices = cli.paths.app.root + '/src/server/services/**/*.ts';
const globModuleService = '@app/server/services/**';
const globRoutes = cli.paths.app.root + '/src/server/routes/**/*.ts';

module.exports = {
    test: [globRoutes, globServices],
    plugins: [
        [Plugin]
    ]
}

/*----------------------------------
- PLUGIN
----------------------------------*/
function Plugin (babel) {

    const t = babel.types as typeof types;

    const remplacerFonction = require('./remplacerFonction').default(t);

    const plugin: PluginObj<{
        fichier: string,
        cheminApi: string | undefined,
        dependances: {[fichier: string]: {  }}
        nbDependances: number,
        servicesImportes: {[nom: string]: string}
    }> = {
        pre(state) {

            this.fichier = state.opts.filename as string;

            this.cheminApi = getCheminControleur(this.fichier);

            //console.log('fichier', fichier);

            this.dependances = {}; // fichier service => { classe, dependances }
            this.nbDependances = 0;

            // Permet d'identifier le chemin du module associé à un nom de type
            this.servicesImportes = {};

            for (const nomBinding in state.scope.bindings) {
                const binding = state.scope.bindings[nomBinding].path;
                // Les services doitvent être importés via un import default
                if (binding.type === 'ImportDefaultSpecifier' && binding.parent.type === 'ImportDeclaration') {

                    const fichier = binding.parent.source.value;

                    if (!minimatch(fichier, globModuleService))
                        continue;

                    this.servicesImportes[nomBinding] = fichier;

                }
            }

        },
        visitor: {

            // Typescript vire les imports quand ils sont utilisés uniquement comme des types
            // Etant donné que ces derniers sont encore visibles dans pre(state) mais qu'ils le sont plus ici,
            // On les rajoute
            Program(path) {
                for (const nomService in this.servicesImportes) {
                    if (!( nomService in path.scope.bindings )) {

                        console.log('Importation forcée de ' + nomService + ' dans ' + this.fichier);

                        path.unshiftContainer(
                            'body',
                            t.importDeclaration(
                                [t.importDefaultSpecifier( t.identifier(nomService) )],
                                t.stringLiteral( this.servicesImportes[ nomService ] )
                            )
                        )
                    }
                }
            },

            // Classe service
            ClassMethod(i) {
                try {

                    const constructeurService = (
                        i.node.kind === 'constructor' 
                        && 
                        i.node.params.length !== 0
                    );
                    if (!constructeurService) return;

                    const classeParent = i.findParent(p => p.node.type === 'ClassDeclaration');
                    const parentService = (
                        classeParent !== undefined
                        &&
                        (classeParent.node as types.ClassDeclaration).id.name.endsWith('Service')
                    )
                    if (!parentService) return;

                    // Extraction de la liste des dépendances
                    const remplacement = remplacerFonction.bind(this)(i.node)
                    if (remplacement !== null)
                        i.replaceWith(remplacement);

                } catch (e) {
                    console.error("[plugin injection-dependances] Erreur traitement constructeur classe", e);
                    throw e;
                }
            },

            // Route
            CallExpression(i) {
                try {

                    if (i.node.loc === undefined) return; // Pas de loc = nouvellement créé = Pas besoin de retraiter

                    // xxx.get('/', ...)
                    if (
                        i.node.callee.type === 'MemberExpression'
                        &&
                        i.node.callee.property.type === 'Identifier'
                        &&
                        ['get', 'post', 'put', 'delete'].includes(i.node.callee.property.name)
                        &&
                        i.node.arguments.length >= 2 // url + au moins 1 middleware
                        &&
                        i.node.arguments[0].type === 'StringLiteral'
                    ) {

                        i.replaceWith(
                            t.callExpression(
                                i.node.callee, 
                                i.node.arguments.map((arg) => (
                                    // async ( ... ) => { ... }
                                    arg.type === 'ArrowFunctionExpression'
                                    &&
                                    arg.async === true
                                    &&
                                    arg.params.length !== 0
                                ) ? remplacerFonction.bind(this)(arg) || arg : arg)
                            )
                        );

                    }

                } catch (e) {
                    console.error("[plugin injection-dependances] Erreur traitement controleur route", e);
                    throw e;
                }

            },

            // Injection chemin fichier dans la définition des requetes api
            ExportDefaultDeclaration(instruction) {

                if (this.cheminApi === undefined)
                    return;

                const declaration = instruction.node.declaration;

                // Avant: export default Route.api({ ... });
                // Après: export default Route.api({ ... }, 'Earn.Tasks.Missions.Get');
                if (
                    declaration.type === 'CallExpression'
                    &&
                    declaration.callee.type === 'MemberExpression'
                    &&
                    declaration.callee.object.type === 'Identifier'
                    &&
                    declaration.callee.object.name === 'Route'
                    &&
                    declaration.callee.property.type === 'Identifier'
                    &&
                    declaration.callee.property.name === 'api'
                    &&
                    declaration.arguments.length === 1
                    &&
                    declaration.arguments[0].type === 'ObjectExpression'
                ) {

                    //console.log('METHODES API', this.cheminApi);

                    const chemin = this.cheminApi;

                    instruction.replaceWith(
                        t.exportDefaultDeclaration(
                            t.callExpression(
                                declaration.callee,
                                [
                                    declaration.arguments[0],
                                    t.stringLiteral(chemin)
                                ]
                            )
                        )
                    )

                }

            }
        },
        post(state) {

            if (this.nbDependances !== 0)
                state.metadata['injection-dependances'] = this.dependances;

        }
    };

    return plugin;
}
