/*----------------------------------
- DEPENDANCES
----------------------------------*/

// Npm
import * as types from '@babel/types'

import { PluginObj } from '@babel/core';

export type TIndexIcones = { [chemin: string]: { id: string, nom: string, fichier: string } };

/*----------------------------------
- WEBPACK RULE
----------------------------------*/
module.exports = {
    test: /\.(tsx|jsx|ts)$/,  // <i src="icon" /> et /* @icon */"icon"
    plugins: [
        [Plugin]
    ]
}

const debug = false;

const defaultIconsPack = 'regular';

/*----------------------------------
- PLUGIN
----------------------------------*/
const ids: string[] = []
function Plugin (babel) {

    const t = babel.types as typeof types;

    const plugin: PluginObj<{
        referencerIcone: (nomBrut: string) => string | null,
        fichier: string,
        traiter: boolean,
        iconeTrouvee: boolean,
        icones: TIndexIcones
    }> = {
        pre(state) {

            this.fichier = state.opts.filename as string;

            //console.log('SVG', fichier);

            this.traiter = true;
            this.iconeTrouvee = false;

            this.icones = {}; // chemin => { id, nom }

            this.referencerIcone = (nomBrut: string) => {
              
                // Décomposition & dossier par défaut
                let [dossierIcone, nomIcone] = nomBrut.split('/');
                if (nomIcone === undefined) {
                    nomIcone = dossierIcone;
                    dossierIcone = defaultIconsPack;
                }

                // Extraction des infos
                const cheminIconeBrut = dossierIcone + '/' + nomIcone;
                const cheminIcone =  cheminIconeBrut + '.svg';

                // Référencement si pas déjà fait
                if (this.icones[ cheminIconeBrut ] === undefined) {

                    const id = nomBrut.replace(/\//g, '-');

                    this.icones[ cheminIconeBrut ] = {
                        //id: dossierIcone.substring(0, 1) + '-' + nomIcone,
                        id: id,
                        nom: nomBrut,
                        fichier: cheminIcone
                    };

                }

                this.iconeTrouvee = true;

                debug && console.log(`[icons]`, nomBrut, '=>', this.icones[cheminIconeBrut].id);

                ids.push(this.icones[cheminIconeBrut].id);

                return this.icones[ cheminIconeBrut ].id;
            }

        },
        visitor: {
            Program: {

                enter(path) {

                    if (!this.traiter)
                        return;

                },
            },

            StringLiteral(path) {
                
                // Marquage d'une référence à une icon via un /* @icon */"<nom>"
                if (
                    path.node.leadingComments
                    &&
                    path.node.leadingComments.length !== 0
                    &&
                    path.node.leadingComments[0].value === ' @icon '
                ) {

                    // Remplacement par id
                    const idIcone = this.referencerIcone(path.node.value);
                    if (idIcone === null)
                        return;
                        
                    path.replaceWith(
                        t.stringLiteral(idIcone)
                    );

                    path.skip();

                }
            },

            // { icon: "solid/<nom>" }
            Property(path) {
                if (
                    path.node.key.type === 'Identifier'
                    &&
                    path.node.key.name === 'icon'
                    &&
                    path.node.value?.type === 'StringLiteral'
                ) {

                    // Remplacement par id
                    const idIcone = this.referencerIcone(path.node.value.value);
                    if (idIcone === null)
                        return;

                    path.replaceWith(
                        t.objectProperty(
                            t.identifier('icon'),
                            t.stringLiteral( idIcone )
                        )
                    );

                    path.skip();

                }
            },

            JSXAttribute(path) {

                // icon="solid/<nom>"
                if (
                    path.node.name.type === 'JSXIdentifier'
                    &&
                    path.node.name.name.startsWith("icon")
                    &&
                    path.node.value
                ) {

                    const nomAttr = path.node.name.name;
                    const valAttr = path.node.value;
                    let remplacement;

                    // icon="solid/<nom>"
                    if (valAttr.type === 'StringLiteral') {

                        const idIcone = this.referencerIcone(valAttr.value);
                        if (idIcone === null)
                            return;

                        remplacement = t.stringLiteral(idIcone)

                    // icon={condition ? "solid/<nom>" : "solid/<nom>"}
                    } else if (
                        valAttr.type === 'JSXExpressionContainer'
                        &&
                        valAttr.expression.type === 'ConditionalExpression'
                        &&
                        valAttr.expression.consequent.type === 'StringLiteral'
                        &&
                        valAttr.expression.alternate.type === 'StringLiteral'
                    ) {

                        const idIcone1 = this.referencerIcone(valAttr.expression.consequent.value);
                        const idIcone2 = this.referencerIcone(valAttr.expression.alternate.value);

                        remplacement = t.jsxExpressionContainer(
                            t.conditionalExpression(
                                valAttr.expression.test,
                                idIcone1 ? t.stringLiteral(idIcone1) : valAttr.expression.consequent,
                                idIcone2 ? t.stringLiteral(idIcone2) : valAttr.expression.alternate,
                                
                            )
                        )

                    } else
                        return;

                    path.replaceWith(
                        t.jsxAttribute(
                            t.jsxIdentifier( nomAttr ),
                            remplacement
                        )
                    );

                    path.skip();
                    
                }
            },

            JSXElement(path) {

                // <i  />
                if (
                    this.traiter
                    &&
                    path.node
                    &&
                    path.node.openingElement
                    &&
                    path.node.openingElement.name.type === 'JSXIdentifier'
                    &&
                    path.node.openingElement.name.name === 'i'
                ) {

                    // Extraction des attributs src et class
                    let attrSrc: types.JSXAttribute | undefined = undefined;
                    let attrClassName: any = undefined;
                    let nouveauxAttributs = path.node.openingElement.attributes.filter((attribut) => {

                        if (attribut.type === 'JSXAttribute' && attribut.name) {

                            if (attribut.name.name === 'src') {
                                attrSrc = attribut;
                                return false;
                            } else if (attribut.name.name === 'class') {

                                attrClassName = attribut.value;

                                return false;
                            }
                        }
                        return true;
                    });

                    if (attrSrc === undefined)
                        return;

                    // <i src="..." />
                    let classeIcone: types.StringLiteral | types.BinaryExpression | undefined = undefined;

                    // Chaine: On référence le nom de l'icon
                    if (attrSrc.value.type === 'StringLiteral') {

                        // <i src="spin" /> =>  <i class="svg-xxxxx spin" />
                        let valSrc = attrSrc.value.value
                        if (valSrc === 'spin') {

                            const idIcone = this.referencerIcone('solid/spinner-third');
                            if (idIcone === null)
                                return;

                            classeIcone = t.stringLiteral('svg-' + idIcone + ' spin');

                        // <i src="regular/user" /> =>  <i class="svg-xxxxxx" />
                        } else {

                            const idIcone = this.referencerIcone(valSrc);
                            if (idIcone === null)
                                return;

                            classeIcone = t.stringLiteral('svg-' + idIcone);
                        }

                    // Autre: on renomme src en class et contatène le préfixe "svg-"
                    // <i src={icon} /> =>  <i class={"svg-" + icon} />
                    } else if (attrSrc.value.type === 'JSXExpressionContainer') {

                        classeIcone = t.binaryExpression(
                            '+',
                            t.stringLiteral('svg-'),
                            attrSrc.value.expression
                        );

                    } else
                        throw new Error(`Type de valeur non-géré pour l'attribut src: ${attrSrc.value.type}`);

                    path.replaceWith(

                        // Balise <i>
                        t.jsxElement(
                            t.jsxOpeningElement(
                                t.jsxIdentifier('i'),

                                // Attributs
                                [
                                    ...nouveauxAttributs,
                                    t.jsxAttribute(
                                        t.jsxIdentifier("class"),

                                        // Attribut class
                                        // concatSrc doit toujours être en premier dans les binary expressions
                                        // afin que le sélecteur CSS i[class^="svg-"] soit toujours valable
                                        t.jsxExpressionContainer(
                                            attrClassName // Concaténation si attribut déjà défini
                                                ? t.binaryExpression(
                                                    '+',
                                                    classeIcone,

                                                    t.binaryExpression(
                                                        '+',
                                                        t.stringLiteral(' '),
                                                        attrClassName.type === 'JSXExpressionContainer'
                                                            ? attrClassName.expression
                                                            : attrClassName
                                                    )
                                                )
                                                : classeIcone
                                        )
                                    )
                                ]
                            ),
                            t.jsxClosingElement(
                                t.jsxIdentifier('i')
                            ),
                            path.node.children,
                            path.node.selfClosing
                        )
                    );
                }
            }
        },
        post(state) {

            if (!this.traiter || !this.iconeTrouvee)
                return;

            //console.log('@@@@@@ TEST ICONE', this.icones['/home/gaetan/www/Professionnel/Node/framework/kernel/client/assets/img/icones/fa/free/brands/youtube.svg']);

            state.metadata['icones-svg'] = this.icones;

        }
    };

    return plugin;
}
