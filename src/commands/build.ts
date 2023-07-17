/*----------------------------------
- DEPENDANCES
----------------------------------*/

// Npm
import prompts from 'prompts';

// Configs
import Compiler from '../compiler';

/*----------------------------------
- TYPES
----------------------------------*/

/*----------------------------------
- COMMAND
----------------------------------*/
export const run = (): Promise<void> => new Promise(async (resolve) => {

    const compiler = new Compiler('prod');

    const multiCompiler = await compiler.create();

    multiCompiler.run((error, stats) => {

        if (error) {
            console.error("An error occurred during the compilation:", error);
            throw error;
        }

        resolve();

    });
});