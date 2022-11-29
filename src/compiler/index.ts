/*----------------------------------
- DEPENDANCES
----------------------------------*/

// Npm
import path from 'path';
import webpack from 'webpack';
import fs from 'fs-extra';

import SpeedMeasurePlugin from "speed-measure-webpack-plugin";
const smp = new SpeedMeasurePlugin({ disable: true });

// Core
import createServerConfig from './server';
import createClientConfig from './client';
import { TCompileMode } from './common';
import { fixNpmLinkIssues } from './common/utils/fixNpmLink'; 

// types
import type App from '../app';

type TCompilerCallback = () => void

/*----------------------------------
- FONCTION
----------------------------------*/
export const compiling: { [compiler: string]: Promise<void> } = {};

export default async function createCompilers( 
    app: App,
    mode: TCompileMode,
    { before, after }: {
        before?: TCompilerCallback,
        after?: TCompilerCallback,
    } = {}
) {

    // Cleanup
    fs.emptyDirSync( app.paths.bin );
    fs.ensureDirSync( path.join(app.paths.bin, 'public') )
    const publicFiles = fs.readdirSync(app.paths.public);
    for (const publicFile of publicFiles) {
        // Dev: faster to use symlink
        if (mode === 'dev')
            fs.symlinkSync( 
                path.join(app.paths.public, publicFile), 
                path.join(app.paths.bin, 'public', publicFile) 
            );
        // Prod: Symlink not always supported by CI / Containers solutions
        else
            fs.copySync( 
                path.join(app.paths.public, publicFile), 
                path.join(app.paths.bin, 'public', publicFile) 
            );
    }

    /* FIX issue with npm link
        When we install a module with npm link, this module's deps are not installed in the parent project scope
        Which causes some issues:
        - The module's deps are not found by Typescript
        - Including React, so VSCode shows that JSX is missing
    */
    fixNpmLinkIssues(app);

    // Create compilers
    const multiCompiler = webpack([
        smp.wrap( createServerConfig(app, mode) ),
        smp.wrap( createClientConfig(app, mode) )
    ]);

    for (const compiler of multiCompiler.compilers) {

        const name = compiler.name;
        if (name === undefined)
            throw new Error(`A name must be specified to each compiler.`);

        let timeStart = new Date();

        let finished: (() => void);
        compiling[name] = new Promise((resolve) => finished = resolve);

        compiler.hooks.compile.tap(name, () => {

            before && before();

            compiling[name] = new Promise((resolve) => finished = resolve);

            timeStart = new Date();
            console.info(`[${name}] ########## Compiling ...`);
        });

        /* TODO: Ne pas résoudre la promise tant que la recompilation des données indexées (icones, identité, ...) 
            n'a pas été achevée */
        compiler.hooks.done.tap(name, stats => {

            // Affiche les détails de la compilation
            console.info(stats.toString(compiler.options.stats));

            // Shiow status
            const timeEnd = new Date();
            const time = timeEnd.getTime() - timeStart.getTime();
            if (stats.hasErrors()) {
                console.error(`############## Failed to compile '${name}' after ${time} ms`);
                process.exit(0);
            } else {
                console.info(`############## [${name}] Finished compilation after ${time} ms`);
            }

            // Mark as finished
            finished();
            delete compiling[name];
        });
    }

    return multiCompiler;
}