#!/usr/bin/env -S npx ts-node

process.traceDeprecation = true;

/*----------------------------------
- DEPENDANCES
----------------------------------*/

// Npm
import fs from 'fs-extra';
import cp from 'child_process';

// Libs
import Paths from './paths';

/*----------------------------------
- TYPES
----------------------------------*/

type TCliCommand = () => Promise<{ 
    run: () => Promise<void> 
}>

type TArgsObject = {
    [key: string]: string | boolean | string[]
}

/*----------------------------------
- CLASSE
----------------------------------*/
/*
    IMPORTANT: The CLI must be independant of the app instance and libs
*/
export class CLI {

    // Context
    public args: TArgsObject = {};
    
    public debug: boolean = false;

    public packageJson: {[key: string]: any};

    public constructor(
        public paths = new Paths( process.cwd() )
    ) {
        this.debug && console.log(`[cli] 5HTP CLI`, process.env.npm_package_version);

        this.debug && console.log(`[cli] Apply aliases ...`);
        this.paths.applyAliases();

        this.packageJson = this.loadPkg();

        this.start();
    }

    /*----------------------------------
    - COMMANDS
    ----------------------------------*/
    // Les importations asynchrones permettent d'accéder à l'instance de cli via un import
    // WARN: We load commands asynchonously, so the aliases are applied before the file is imported
    public commands: { [name: string]: TCliCommand } = {
        "init": () => import('./commands/init'),
        "dev": () => import('./commands/dev'),
        "build": () => import('./commands/build'),
    }

    private loadPkg() {
        return fs.readJSONSync(this.paths.core.root + '/package.json');
    }

    public start() {
        
        const [, , commandName, ...argv] = process.argv;

        if (this.commands[commandName] === undefined)
            throw new Error(`Command ${commandName} does not exists.`);

        const options = {
            workdir: process.cwd()
        }

        let opt: string | null = null;
        for (const a of argv) {

            if (a[0] === '-') {

                opt = a.substring(1);
                if (!(opt in options)) 
                    throw new Error(`Unknown option: ${opt}`);

                // Init with default value
                if (typeof options[opt] === "boolean")
                    options[opt] = true;

            } else if (opt !== null) {

                const curVal = options[opt];

                if (Array.isArray( curVal ))
                    curVal.push(a);
                else
                    options[opt] = a;   

                opt = null;

            } else {

                //args.push(a);

            }
        }

        this.runCommand(commandName, options);
    }

    public async runCommand(command: string, args: TArgsObject) {

        this.args = args;

        this.debug && console.info(`Running command ${command}`, this.args);

        // Check existance
        if (this.commands[command] === undefined)
            throw new Error(`Command ${command} does not exists.`);

        const runner = await this.commands[command]();

        // Running
        runner.run().then(() => {

            this.debug && console.info(`Command ${command} finished.`);

        }).catch((e) => {

            console.error(`Error during execution of ${command}:`, e);

        }).finally(() => {

            process.exit(0);

        })
    }


    public shell(...commands: string[]) {

        return new Promise<void>(async (resolve) => {

            const fullCommand = commands.map(command => {

                command = command.trim();

                if (command.endsWith(';'))
                    command = command.substring(0, command.length - 1);

                return command;

            }).join(';');

            console.log('$ ' + fullCommand);

            /*const tempFile = this.paths.app.root + '/.exec.sh';
            fs.outputFileSync(tempFile, '#! /bin/bash\n' + fullCommand);
            const wrappedCommand =  `tilix --new-process -e bash -c 'chmod +x "${tempFile}"; "${tempFile}"; echo "Entrée pour continuer"; read a;'`;*/
            const wrappedCommand =  `bash -c '${fullCommand}'`;
            console.log("Running command: " + wrappedCommand)
            //await this.waitForInput('enter');

            const proc = cp.spawn(wrappedCommand, [], {
                cwd: process.cwd(),
                detached: false,
                // Permer de lancer les commandes via des chaines pures (autrement, il faut separer chaque arg dans un tableau)
                // https://stackoverflow.com/questions/23487363/how-can-i-parse-a-string-into-appropriate-arguments-for-child-process-spawn
                shell: true
            });

            console.log( proc.exitCode );

            proc.on('exit', function () {

                //fs.removeSync(tempFile);

                console.log("Command finished.");
                resolve();
            })

        });
        
    }

}

export default new CLI()