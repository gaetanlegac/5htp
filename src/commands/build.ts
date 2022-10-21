/*----------------------------------
- DEPENDANCES
----------------------------------*/

// Npm
import prompts from 'prompts';

// Configs
import createCompilers from '../compiler';

// Core
import App from '../app';

/*----------------------------------
- TYPES
----------------------------------*/

/*----------------------------------
- COMMAND
----------------------------------*/
export const run = (): Promise<void> => new Promise(async (resolve) => {

    const app = new App();

    const multiCompiler = await createCompilers(app, 'prod');

    multiCompiler.run((error, stats) => {

        if (error) {
            console.error("An error occurred during the compilation:", error);
            throw error;
        }

        resolve();

    });
});