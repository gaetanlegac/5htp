/*----------------------------------
- DEPENDANCES
----------------------------------*/

// Npm
import fs from 'fs-extra';
import { spawn, ChildProcess } from 'child_process';

// Cor elibs
import Keyboard from '../../src/server/utils/keyboard';

// Configs
import createCompilers, { compiling } from '../compiler';
import cli from '../';

/*----------------------------------
- COMMANDE
----------------------------------*/
export const run = () => new Promise<void>(async () => {

    const multiCompiler = await createCompilers('dev', {
        before: () => {

            console.log('before');
            stopApp();

        }, 
        after: () => {


        }
    });

    // Allow the dev servet to fetch the frameworg node modules
    fs.createSymlinkSync( cli.paths.core.root + '/node_modules', cli.paths.app.bin + '/node_modules', 'dir' );

    multiCompiler.watch({

        // https://webpack.js.org/configuration/watch/#watchoptions
        // Watching may not work with NFS and machines in VirtualBox
        // Uncomment next line if it is your case (use true or interval in milliseconds)
        poll: 1000,

        // Decrease CPU or memory usage in some file systems
        ignored: /node_modules\/(?!5\-htp\/src\/)/,

        //aggregateTimeout: 1000,
    }, async (error, stats) => {

        if (error) {
            console.error(`Error in milticompiler.watch`, error, stats?.toString());
            return;
        }

        console.log("Watch callback. Reloading app ...");
        startApp();

    });

    Keyboard.input('ctrl+r', async () => {

        console.log(`Waiting for compilers to be ready ...`, Object.keys(compiling));
        await Promise.all(Object.values(compiling));

        console.log(`Reloading app ...`);
        startApp();

    });

    Keyboard.input('ctrl+c', () => {
        stopApp();
    });
});


/*----------------------------------
- APP RUN
----------------------------------*/
let cp: ChildProcess | undefined = undefined;

async function startApp() {

    stopApp();

    console.info(`Launching new server ...`);
    cp = spawn('node', ['' + cli.paths.app.bin + '/server.js', '--preserve-symlinks'], {

        // sdin, sdout, sderr
        stdio: ['inherit', 'inherit', 'inherit']

    });
}

function stopApp() {
    if (cp !== undefined) {
        console.info(`Killing current server instance (ID: ${cp.pid}) ...`);
        cp.kill();
    }

}