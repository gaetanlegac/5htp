/*----------------------------------
- DEPENDANCES
----------------------------------*/

// Npm
import * as types from '@babel/types'
import type { PluginObj, NodePath } from '@babel/core';
import generate from '@babel/generator';

// Core
import cli from '@cli';
import { TAppSide } from '@cli/index';

/*----------------------------------
- WEBPACK RULE
----------------------------------*/

type TOptions = {
    side: TAppSide
}

module.exports = (options: TOptions) => ({
    test: "**/client/pages/**/*.tsx",
    plugins: [
        [Plugin, options]
    ]
})

const debug = false;

/*----------------------------------
- PLUGIN
----------------------------------*/
function Plugin(babel, { side }: TOptions) {

    const t = babel.types as typeof types;
    let program: NodePath<types.Program>;

    const plugin: PluginObj<{ 
        filename: string
    }> = {
        pre(state) {

            this.filename = state.opts.filename as string;

        },
        visitor: {

            Program(path) {
                program = path;
            },

            CallExpression(path) {
                
                // route.xxx( <PATH>, ... )
                if (!(
                    path.node.callee.type === 'MemberExpression'
                    &&
                    path.node.callee.object.type === "Identifier"
                    &&
                    path.node.callee.object.name === "route"
                    &&
                    path.node.arguments.length >= 2
                ))
                    return;

                const [routePath, ...routeArgs] = path.node.arguments;
                debug && console.log(`[routes]`, this.filename, ...routeArgs.map(n => n.type));
                    
                // Inject chunk id in options (2nd arg)
                const status = addChunkId(routeArgs, this.filename);
                if (status === 'ALREADY_PROCESSED')
                    return;

                // Transform 2nd arg of renderer to a useContext spread
                addRendererContext(routeArgs, this.filename);

                const replacement = t.callExpression( path.node.callee, [ routePath, ...routeArgs ]);
                debug && console.log( generate(replacement).code );

                // Force export default
                if (path.parent.type === 'ExportDefaultDeclaration')
                    path.replaceWith( replacement );
                else
                    path.parentPath.replaceWith(
                        t.exportDefaultDeclaration( replacement )
                    )
                
            }
           
        }
    };

    function addChunkId( 
        routeArgs: types.CallExpression["arguments"],
        filename: string
    ): void | 'ALREADY_PROCESSED' {

        if (routeArgs[0].type === 'ObjectExpression') {

            if (routeArgs[0].properties.some(o =>
                o.type === 'ObjectProperty'
                &&
                o.key.type === 'Identifier'
                &&
                o.key.name === 'id'
            )) {
                debug && console.log(`[routes]`, filename, 'Already Processed');
                return 'ALREADY_PROCESSED';
            }

        } else
            routeArgs.unshift(t.objectExpression([]));

        const { filepath, chunkId } = cli.paths.getPageChunk(filename);
        debug && console.log(`[routes]`, filename, '=>', chunkId);

        // Add object property
        (routeArgs[0] as types.ObjectExpression).properties.push(
            t.objectProperty(
                t.identifier('id'),
                t.stringLiteral(chunkId)
            ),
            t.objectProperty(
                t.identifier('filepath'),
                t.stringLiteral(filepath)
            )
        );

    }

    function addRendererContext( 
        routeArgs: types.CallExpression["arguments"],
        filename: string
    ) {

        // ( <data>, { response, api }) => ....
        const renderer = routeArgs[ routeArgs.length - 1 ];
        if (!(
            renderer.type === 'ArrowFunctionExpression' 
            && 
            renderer.params.length > 1
        ))
            return;

        // Remove 2nd arg (renderer = react component, so only 1 arg for props)
        const declaration = renderer.params.pop() as types.ArrowFunctionExpression["params"][number];
        // const <param2> = useContext();
        const ctxDeclaration = t.variableDeclaration('const', [t.variableDeclarator(
            declaration,
            t.callExpression(t.identifier('useContext'), [])
        )])

        // Add Declaration
        switch (renderer.body.type) {
            case 'BlockStatement':
                renderer.body.body.unshift(ctxDeclaration);
                break;
            // TODO: Si type === JSXElement, remplacer par BlockStatement (ctxDeclaration + return JSX)
            /*case 'BlockStatement':
                renderer.re
                break;*/
            default:
                throw new Error(`Unknown body type for the renderer: ${renderer.body.type}`);
        }

        // Add usecontext import if it doesn't exists
        if (program.scope.bindings["useContext"] === undefined) {

            debug && console.log(`[routes]`, filename, `Adding useContext import from @context`);

            program.unshiftContainer(
                'body',
                t.importDeclaration(
                    [t.importDefaultSpecifier(t.identifier('useContext'))],
                    t.stringLiteral('@client/context')
                )
            );
        }
        

    }

    return plugin;
}