/*----------------------------------
- DEPENDANCES
----------------------------------*/

// Npm
import * as types from '@babel/types'
import type { PluginObj, NodePath } from '@babel/core';
import generate from '@babel/generator';

// Core
import type { TAppSide } from '@cli/index';

/*----------------------------------
- WEBPACK RULE
----------------------------------*/

type TOptions = {
    side: TAppSide
}

module.exports = (options: TOptions) => ({
    test: "**/server/models/**/*.ts",
    plugins: [
        [Plugin, options]
    ]
})

module.exports.Plugin = Plugin;

const debug = true;

const metasKey = 'metadata';

/*----------------------------------
- PLUGIN
----------------------------------*/
function Plugin(babel, {  }: TOptions) {

    const t = babel.types as typeof types;

    const plugin: PluginObj<{ filename: string }> = {
        pre(state) {

            this.filename = state.opts.filename as string;

        },
        visitor: {
            Program(path) {

                const filename = this.filename;

                // Lorsque les visiteurs sont déclarés à la racine du plugin,
                //    Impossible d'obtenir les ast des décorateurs car ils ont déjà été compilés ...
                //    Pourquoi cela fonctionne en passant par Program.traverse ?
                path.traverse({
                    Decorator(path) {

                        injectMetadatas(path, filename, t);

                    },
                });
                

            }
           
        }
    };

    return plugin;
}

/*----------------------------------
- EXTRACTION
----------------------------------*/
function injectMetadatas( path: NodePath<types.Decorator>, filename: string, t: typeof types ) {

    // @Table( <database>, <table>, <options?> )
    const expression = path.node.expression;
    if (!(
        expression.type === 'CallExpression'
        &&
        expression.callee.type === 'Identifier'
        &&
        expression.callee.name === 'Table'
        &&
        expression.arguments.length >= 2
    ))
        return;

    // Class
    const classe = path.parent;
    if (classe.type !== 'ClassDeclaration')
        return;

    debug && console.log(`Processing class ${classe.id.name}`);

    // Only process if metadata are not already defined
    let [database, table, options] = expression.arguments;
    if (options !== undefined) {

        if (options.type !== 'ObjectExpression')
            throw new Error(`Error in ${filename}: The 3rd argument of @Table must be an object expression.`);

        const hasMetas = options.properties.some(p =>
            p.type === 'ObjectProperty'
            &&
            p.key.type === 'Identifier'
            &&
            p.key.name === metasKey
        );

        if (hasMetas) {
            debug && console.log(`Metadata already provides for class ${classe.id.name} (${filename})`);
            return;
        }
    }

    // Extract metadata
    const attributes = extractMetadata(classe, t);
    //debug && console.log( generate(attributes).code );
    const metasProperty = t.objectProperty(
        t.identifier(metasKey),
        t.objectExpression(attributes)
    )

    // Insert metas in options
    if (options === undefined)
        options = t.objectExpression([metasProperty]);
    else
        options = t.objectExpression([...options.properties, metasProperty]);

    // Update decorator
    path.replaceWith(t.decorator(
        t.callExpression(t.identifier('Table'), [
            database,
            table,
            options
        ])
    ));
}

function extractMetadata(classe: types.ClassDeclaration, t: typeof types) {

    const attributes: types.ObjectProperty[] = [];

    // Lecture des propriétés et méthodes de la classe
    for (const prop of classe.body.body) {

        if (!(
            // non-statique
            !prop.static
            &&
            (
                // Propriété simple
                prop.type === 'ClassProperty'
                || 
                // Getter
                (prop.type === 'ClassMethod' && prop.kind === 'get')
            )
            &&
            // Publique
            prop.accessibility === 'public'
            &&
            prop.key.type === 'Identifier'
        ))
            continue;

        const nomProp = prop.key.name;

        // Détermine si la propriété est exposée à l'api
        // = possède le décorateur @API()
        const exposeToAPI = prop.decorators && prop.decorators.some((decorateur) =>
            decorateur.expression.type === 'CallExpression'
            &&
            decorateur.expression.callee.type === 'Identifier'
            &&
            decorateur.expression.callee.name === 'API'
        );

        if (!exposeToAPI) continue;

        let type: any;
        if (prop.type === 'ClassProperty')
            type = prop.typeAnnotation;
        else
            type = prop.returnType;

        // Verif si type spécifié
        if (!type)
            throw new Error(`Unable to extract type of ${classe.id.name}.${prop.key.name}.`);

        // Sérialisation du type
        const typeString = generate(type.typeAnnotation).code;

        debug && console.log( classe.id.name + '.' + nomProp + ': ' + typeString );

        // Sérialisation valeur defaut
        const defaut = prop.type === 'ClassProperty' && prop.value && ('value' in prop.value)
            ? prop.value
            : t.identifier('undefined')

        attributes.push(
            t.objectProperty( t.identifier(nomProp), t.objectExpression([

                t.objectProperty( 
                    t.identifier('nom'), 
                    t.stringLiteral(nomProp)
                ),

                t.objectProperty( 
                    t.identifier('nomComplet'), 
                    t.stringLiteral(prop.optional ? nomProp + '?' : nomProp)
                ),

                t.objectProperty( 
                    t.identifier('type'), 
                    t.stringLiteral(typeString)
                ),

                t.objectProperty( 
                    t.identifier('optionnel'), 
                    t.booleanLiteral(prop.optional === true)
                ),

                t.objectProperty(
                    t.identifier('api'),
                    t.booleanLiteral(exposeToAPI)
                ),

                t.objectProperty(
                    t.identifier('defaut'),
                    defaut
                ),
                
            ]))
        );
    }

    return attributes;

}
