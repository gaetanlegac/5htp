/*----------------------------------
- DEPENDANCES
----------------------------------*/

import { PluginObj } from '@babel/core'; 

import * as types from '@babel/types'
import generate from '@babel/generator';

/*----------------------------------
- WEBPACK RULE
----------------------------------*/
module.exports = {
    test: "**/client/**/*.tsx",
    plugins: [
        [Plugin]
    ]
}

const debug = false

/*----------------------------------
- PLUGIN
----------------------------------*/
function Plugin (babel) {

    const t = babel.types as typeof types;

    const plugin: PluginObj<{
        fichier: string,
        cancel: boolean
    }> = {
        pre(state) {

            this.fichier = state.opts.filename as string;

            if (!('useForm' in state.scope.bindings))
                this.cancel = true;

        },
        visitor: {
            JSXElement(instruction) {

                if (this.cancel === true)
                    return;

                const balise = instruction.node.openingElement;

                /*
                    <Champs.metas.titre className="full" attrsChamp={{ className: "h1" }} />
                */

                if (!(
                    balise.selfClosing === true
                    &&
                    balise.name.type === 'JSXMemberExpression'
                    &&
                    balise.name.property.type === 'JSXIdentifier'
                ))
                    return;

                debug && console.log(`[compilation][babel][form] Original: `, generate(instruction.node).code);

                // Si le premier element du memberexpression est Champ
                let nomA: types.JSXMemberExpression | types.JSXIdentifier = balise.name;
                while (nomA.type === 'JSXMemberExpression')
                    nomA = nomA.object;
                if (!nomA.name.startsWith('Champs'))
                    return;

                // Ne pas parcourir les élements enfant
                // Avec .stop, babel arrête d'itérer les élements voisins à partir du 6ème - 7ème
                //instruction.stop();
                instruction.skip();

                // Transformation de la lste des attributs en un objet
                /*
                    className="full" attrsChamp={{ className: "h1" }}

                    =>

                    { className: "full", attrsChamp: { className: "h1" } }
                */
                let objAttributs: types.ObjectProperty[] = [];
                for (const attribut of balise.attributes)
                    if (attribut.type === 'JSXAttribute' && attribut.value !== undefined)
                        objAttributs.push(
                            t.objectProperty(
                                t.identifier( attribut.name.name ),
                                attribut.value === null // <Champ.titre autoFocus />
                                    ? t.booleanLiteral(true)
                                    : attribut.value.type === 'JSXExpressionContainer'
                                        ? attribut.value.expression
                                        : attribut.value
                            )
                        )

                // Traverse chaque branche du chemin du champ, dans l'ordre inverse
                // NOTE: on aurai pu reconstituer le chemin et créer les memberexpressions en une seule itération
                //      Mais le fait d ele faire en deux itérations rend le code plus claire et maintenable
                let cheminComposant: string[] = []
                let brancheA: types.JSXMemberExpression | types.JSXIdentifier = balise.name;
                while (brancheA.type === 'JSXMemberExpression') {

                    const { property } = brancheA;
                    
                    cheminComposant.unshift(property.name)
                    brancheA = brancheA.object;
                }

                let cheminSchema: types.MemberExpression | types.OptionalMemberExpression = t.memberExpression( 
                    t.identifier('Champs'), 
                    t.identifier('schema') 
                );
                let cheminDonnees: types.MemberExpression | types.OptionalMemberExpression = t.memberExpression( 
                    t.identifier('Champs'), 
                    t.identifier('data') 
                );
                const iDerniereBranche = cheminComposant.length - 1
                for (let iBranche = iDerniereBranche; iBranche >= 0; iBranche--) {

                    const branche = cheminComposant[ iBranche ];

                    cheminSchema = t.optionalMemberExpression(
                        cheminSchema,
                        t.identifier( branche ),
                        undefined,
                        true
                    )

                    if (iBranche !== iDerniereBranche)
                        cheminDonnees = t.optionalMemberExpression(
                            cheminDonnees,
                            t.identifier(branche),
                            undefined,
                            true
                        )

                }

                // Remplacement
                /*
                    {Champs._render( Champs.metas?.titre, Champs._data.metas?.titre, 'metas.titre', {
                        className: "full",
                        attrsChamp: { className: "h1" }
                    })}
                */
                const remplacement = t.callExpression(

                    // Champs.render
                    t.memberExpression(
                        t.identifier('Champs'),
                        t.identifier('render')
                    ),
                    [
                        // Champs.<chemin>
                        cheminSchema,

                        // Champs._data.<chemin>
                        cheminDonnees,

                        // Chemin
                        t.stringLiteral( cheminComposant.join('.') ),

                        // { <attrs> }
                        t.objectExpression(objAttributs)
                    ]
                )

                debug && console.log(`[compilation][babel][form] Remplacement: `, generate(remplacement).code );

                instruction.replaceWith(remplacement);
                
            }
        },
    };

    return plugin;
}
