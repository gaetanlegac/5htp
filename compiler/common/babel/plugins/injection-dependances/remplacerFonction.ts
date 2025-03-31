
import * as types from '@babel/types'
import generate from "@babel/generator";

const servicesViaContexte: {
    [nomService: string]: string
} = {
    User: 'user',

    Request: 'req',
    Response: 'res',
    NextFunction: 'next'
} as const

const debug = false

export default (t: typeof types) => {

    function remplacerFonction(arg: types.ArrowFunctionExpression): null | types.ArrowFunctionExpression;
    function remplacerFonction(arg: types.ClassMethod): null | types.ClassMethod;
    function remplacerFonction(
        arg: types.ArrowFunctionExpression | types.ClassMethod
    ): null | types.ArrowFunctionExpression | types.ClassMethod {

        const dejaTraite = (
            arg.params.length === 1
            &&
            arg.params[0].type === 'RestElement'
        )
        if (dejaTraite)
            return null;

        // Return null = inchangé
        if (arg.body.type !== 'BlockStatement')
            return null;

        let declarations: types.VariableDeclarator[] = [];
        let instanciations: types.ExpressionStatement[] = [];
        let extractions: types.ExpressionStatement[] = [];

        // Transforme les paramètres en une liste d'instanciations
        for (let iParam = 0; iParam < arg.params.length; iParam++) {
            const param = arg.params[iParam];

            // utilisateur: User
            if (
                param.type === 'Identifier' && param.typeAnnotation
                &&
                param.typeAnnotation.type === 'TSTypeAnnotation'
                &&
                param.typeAnnotation.typeAnnotation.type === 'TSTypeReference'
                &&
                param.typeAnnotation.typeAnnotation.typeName.type === 'Identifier'
            ) {

                const typeParam = param.typeAnnotation.typeAnnotation.typeName.name;
                const nomParam = param.name;

                // Déclaration
                declarations.push(
                    t.variableDeclarator(
                        t.identifier(nomParam)
                    )
                );

                // Instanciation (quand args[0] = contexte)
                if (typeParam in servicesViaContexte) {

                    // <nomParam> = args[ 0 ][ servicesViaContexte[ typeParam ] ];
                    instanciations.push(
                        t.expressionStatement(
                            t.assignmentExpression(
                                '=',
                                t.identifier(nomParam),
                                t.memberExpression(
                                    t.memberExpression(
                                        t.identifier('args'),
                                        t.numericLiteral(0),
                                        true
                                    ),
                                    t.identifier(servicesViaContexte[typeParam])
                                )
                            )
                        )
                    )

                    // Le type du paramètre est un service reconnu
                } else if (this.servicesImportes[typeParam] !== undefined) {

                    // <nomParam> = new <typeParam>( args[0] );
                    instanciations.push(
                        t.expressionStatement(
                            t.assignmentExpression(
                                '=',
                                t.identifier(nomParam),
                                t.newExpression(
                                    t.identifier(typeParam),
                                    [
                                        t.memberExpression(
                                            t.identifier('args'),
                                            t.numericLiteral(0),
                                            true
                                        )
                                    ]
                                )
                            )
                        )
                    );

                } else {
                    console.log(this.servicesImportes);
                    throw new Error(`Impossible de trouver l'import associée au type portant pour nom ${typeParam} (fichier: ${this.fichier}). Liste des iportations trouvées au dessus.`)
                }

                // Extractions
                // <nomParam> = args[ <index> ]
                extractions.push(
                    t.expressionStatement(
                        t.assignmentExpression(
                            '=',
                            t.identifier(nomParam),
                            t.memberExpression(
                                t.identifier('args'),
                                t.identifier( iParam.toString() ),
                                true
                            )
                        )
                    )
                );

            }
        }

        // Inchangé
        if (instanciations.length === 0)
            return null;

        const conditionSiDoitInstancier = (
            t.logicalExpression(
                '&&',
                t.logicalExpression(
                    '&&',

                    // args[0] !== undefined
                    t.binaryExpression(
                        '!==',
                        t.memberExpression(
                            t.identifier('args'),
                            t.numericLiteral(0),
                            true
                        ),
                        t.identifier('undefined')
                    ),

                    // typeof args[0] === 'object'
                    t.binaryExpression(
                        '===',
                        t.unaryExpression(
                            'typeof',
                            t.memberExpression(
                                t.identifier('args'),
                                t.identifier('0'),
                                true
                            )
                        ),
                        t.stringLiteral('object')
                    )
                ),

                // args[0].type === 'contexte_requete'
                t.binaryExpression(
                    '===',
                    t.memberExpression(
                        t.memberExpression(
                            t.identifier('args'),
                            t.identifier('0'),
                            true
                        ),
                        t.identifier('type')
                    ),
                    t.stringLiteral('contexte_requete')
                )
            )
        )

        const body = t.blockStatement([
            t.variableDeclaration('let', declarations),

            // if (args[0] !== undefined && typeof args[0] === 'object' && args[0].type === 'contexte_requete')
            t.ifStatement(
                conditionSiDoitInstancier,

                t.blockStatement(instanciations),

                t.blockStatement(extractions)
            ),
            ...arg.body.body
        ]);

        // Remplacement paramètres et ajout des instanciations
        const remplacement = arg.type === 'ArrowFunctionExpression'
            ? t.arrowFunctionExpression(
                [t.restElement( t.identifier('args') )],
                body,
                arg.async
            )
            : t.classMethod(
                'constructor',
                t.identifier('constructor'),
                [t.restElement( t.identifier('args') )],
                body
            )

        if (debug) {
            console.log('-----------------------------');
            console.log(generate(arg).code);
            console.log('=>');
            console.log(generate(remplacement).code);
            console.log('-----------------------------');
        }

        return remplacement;
    }

    return remplacerFonction;
}