/*----------------------------------
- DEPENDANCES
----------------------------------*/

// Npm
import fs from 'fs-extra';
import { spawn, ChildProcess } from 'child_process';

// Cor elibs
import cli from '..';
import Keyboard from '../utils/keyboard';

// Configs
import Compiler from '../compiler';

// Core
import { app, App } from '../app';

/*----------------------------------
- COMMANDE
----------------------------------*/
export const run = () => new Promise<void>(async () => {

    const compiler = new Compiler('dev', {
        before: (compiler) => {

            const changedFilesList = compiler.modifiedFiles ? [...compiler.modifiedFiles] : [];

            if (changedFilesList.length === 0)
                stopApp("Starting a new compilation");
            else
                stopApp("Need to recompile because files changed:\n" + changedFilesList.join('\n'));

        }, 
        after: () => {


        }
    });

    const multiCompiler = await compiler.create();

    multiCompiler.watch({

        // https://webpack.js.org/configuration/watch/#watchoptions
        // Watching may not work with NFS and machines in VirtualBox
        // Uncomment next line if it is your case (use true or interval in milliseconds)
        poll: 1000,

        // Decrease CPU or memory usage in some file systems
        // Ignore updated from:
        // - Node modules except 5HTP core (framework dev mode)
        // - Generated files during runtime (cause infinite loop. Ex: models.d.ts)
        ignored: /(node_modules\/(?!5htp\-core\/))|(\.generated\/)/

        //aggregateTimeout: 1000,
    }, async (error, stats) => {

        if (error) {
            console.error(`Error in milticompiler.watch`, error, stats?.toString());
            return;
        }

        console.log("Watch callback. Reloading app ...");
        startApp(app);

    });

    Keyboard.input('ctrl+r', async () => {

        console.log(`Waiting for compilers to be ready ...`, Object.keys(compiler.compiling));
        await Promise.all(Object.values(compiler.compiling));

        console.log(`Reloading app ...`);
        startApp(app);

    });

    Keyboard.input('ctrl+c', () => {
        stopApp("CTRL+C Pressed");
    });
});


/*----------------------------------
- APP RUN
----------------------------------*/
let cp: ChildProcess | undefined = undefined;

async function startApp( app: App ) {

    stopApp('Restart asked');

    console.info(`Launching new server ...`);
    cp = spawn('node', ['' + app.paths.bin + '/server.js', '--preserve-symlinks'], {

        // sdin, sdout, sderr
        stdio: ['inherit', 'inherit', 'inherit']

    });
}

function stopApp( reason: string ) {
    if (cp !== undefined) {
        console.info(`Killing current server instance (ID: ${cp.pid}) for the following reason:`, reason);
        cp.kill();
    }

}