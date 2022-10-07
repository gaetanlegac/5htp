/*----------------------------------
- DEPENDANCES
----------------------------------*/

// Npm
import webpack from 'webpack';
import fs from 'fs-extra';

import SpeedMeasurePlugin from "speed-measure-webpack-plugin";
const smp = new SpeedMeasurePlugin({ disable: true });

// Core
import createServerConfig from './server';
import createClientConfig from './client';
import { TCompileMode } from './common';
import cli from '../';

type TCompilerCallback = () => void

/*----------------------------------
- FONCTION
----------------------------------*/
export const compiling: { [compiler: string]: Promise<void> } = {};

export default async function createCompilers( 
    mode: TCompileMode,
    { before, after }: {
        before?: TCompilerCallback,
        after?: TCompilerCallback,
    } = {}
) {

    // Cleanup
    fs.emptyDirSync( cli.paths.app.bin );

    // Create compilers
    const multiCompiler = webpack([
        smp.wrap( createServerConfig(mode) ),
        smp.wrap( createClientConfig(mode) )
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