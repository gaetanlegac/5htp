/*----------------------------------
- DEPENDANCES
----------------------------------*/

// Npm
import path from 'path';
import { PluginObj } from '@babel/core';
import * as types from '@babel/types'

/*----------------------------------
- REGEX
----------------------------------*/
const cheminClasseQuery = '@serveur/database/jsql/query/runner';

const regFichierModele = /^[a-z]+\/serveur\/modeles\//i;

/*----------------------------------
- WEBPACK RULE
----------------------------------*/
module.exports = {// /serveur/**.ts */
    test: /\/serveur\/(.*)\.(ts)$/i,
    plugins: [
        [Plugin]
    ]
}


/*----------------------------------
- PLUGIN
----------------------------------*/
function Plugin (babel) {

    const t = babel.types as typeof types;

    const plugin: PluginObj<{
        fichier: string,
        dossier: string
    }> = {
        pre(state) {

            const { filename, root } = state.opts;

            if (!filename)
                throw new Error(`Impossible d'obtenir le chemin du fichier actuellement rraité par le plugin`);

            if (!root)
                throw new Error(`Impossible d'obtenir le chemin de la racine du projet`);

            this.fichier = filename;

            const prefixeRoot = root + '/src/'
            this.dossier = path.dirname(filename).substring(prefixeRoot.length)
        },
        visitor: {
            ImportDeclaration(instruction) {

                if (!(
                    instruction.node.specifiers.length === 1
                    &&
                    instruction.node.specifiers[0].type === 'ImportDefaultSpecifier'
                ))
                    return;

                const cheminImportFichier = instruction.node.source.value;
                const importDefault = instruction.node.specifiers[0];

                /* Recherche de:
                    import PublicScope from './Public/index.sql';
                */
                if (
                    // Suffise SQL = déjà traité, ou intention de garder le SQL
                    !importDefault.local.name.endsWith('SQL')
                    &&
                    cheminImportFichier.endsWith('.sql')
                ) {

                    // Extraction des infos
                    const nomVarScope = importDefault.local.name;
                    const nomImportSql = nomVarScope + 'SQL';
                    const cheminCompletImport = path.join(this.dossier, cheminImportFichier);

                    // Génère un ID unique basé sur le chemin
                    let cheminScope: string = cheminCompletImport;
                    const isModelScope = regFichierModele.test(cheminCompletImport);
                    if (isModelScope) {
                        // Mission.Public
                        const nomModele = path.basename(this.dossier);
                        cheminScope = nomModele + '.' + cheminCompletImport.substring(
                            this.dossier.length + 1, // +1 pour le dernier slash
                        )
                    }

                    cheminScope = cheminScope
                        .substring(0, cheminScope.length - 4) // Vire l'extension .sql
                        .replace(/\//g, '.');

                    if (cheminScope.endsWith('.index'))
                        cheminScope = cheminScope.substring(0, cheminScope.length - 6)

                    // Renommage de l'import du sql et instanciaiton de la query
                    // NOTE: On ne skip pas, puisque les imports ont été suffixés de SQL
                    //instruction.skip();
                    let remplacement = []

                    /* Création factory */
                    remplacement.push(

                        // + import PublicScopeSql from './Public/index.sql';
                        t.importDeclaration(
                            [t.importDefaultSpecifier(t.identifier(nomImportSql))],
                            t.stringLiteral(cheminImportFichier)
                        ),

                        // + const PublicScope = new String( PublicScopeSql );
                        t.variableDeclaration('const', [
                            t.variableDeclarator( 
                                t.identifier(nomVarScope), 
                                t.newExpression(
                                    t.identifier('String'),
                                    [t.identifier(nomImportSql)]
                                ) 
                            )
                        ]),

                        // + PublicScope.id = 'earn/missions/Mission/Public/index';
                        t.expressionStatement(
                            t.assignmentExpression(
                                '=',
                                t.memberExpression(
                                    t.identifier( nomVarScope ),
                                    t.identifier('id')
                                ),
                                t.stringLiteral(cheminScope)
                            )
                        ),

                        // + PublicScope.sourceFile = 'earn/missions/Mission/Public/index.sql'
                        t.expressionStatement(
                            t.assignmentExpression(
                                '=',
                                t.memberExpression(
                                    t.identifier( nomVarScope ),
                                    t.identifier('sourceFile')
                                ),
                                t.stringLiteral(cheminCompletImport)
                            )
                        ),
                    )

                    /*console.log(`[babel][plugin][queries]`, 
                        this.fichier, cheminCompletImport, '\n',
                        recast.print( t.program(remplacement) ).code,
                        cheminScope
                    );*/

                    // Remplacement
                    instruction.replaceWithMultiple(remplacement);

                }

            }
        }
    };

    return plugin;
}