#!/usr/bin/env -S npx ts-node

/*----------------------------------
- DEPENDANCES
----------------------------------*/

// Npm
import { Logger } from "tslog";
import cp from 'child_process';
import fs from 'fs-extra';

// Libs
import Paths from './paths';
import ConfigParser from '../src/server/app/config';

/*----------------------------------
- TYPES
----------------------------------*/

type TCliCommand = { 
    run: () => Promise<void> 
}

export type TAppSide = 'server' | 'client'

/*----------------------------------
- CLASSE
----------------------------------*/
/*
    IMPORTANT: The CLI must be independant of the app instance and libs
*/
export class CLI {

    // Context
    public args: TObjetDonnees = {};
    public pkg = {
        app: require(this.paths.app.root + '/package.json'),
        core: require(this.paths.core.root + '/package.json'),
    }
    
    // config
    // WARNING: High level config files (env and services) shouldn't be loaded from the CLI
    //  The CLI will be run on CircleCI, and no env file should be sent to this service
    public identity!: Core.Config.Identity;

    public constructor(
        public paths = new Paths( process.cwd() )
    ) {
        console.log(`[cli] Start debugger ...`);
        new Logger({ name: "cli", overwriteConsole: true });
        
        console.log(`[cli] Apply aliases ...`);
        this.paths.applyAliases();
        
        console.log(`[cli] Loading app config ...`);
        const configParser = new ConfigParser( paths.appRoot );
        this.identity = configParser.identity();

        this.start();
    }

    /*----------------------------------
    - COMMANDS
    ----------------------------------*/
    // Les importations asynchrones permettent d'accéder à l'instance de cli via un import
    public commands: { [name: string]: TCliCommand } = {
        "dev": require('./commands/dev'),
        "build": require('./commands/build'),
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

    public async runCommand(command: string, args: TObjetDonnees) {

        this.args = args;

        console.info(`Running command ${command}`, this.args);

        // Check existance
        if (this.commands[command] === undefined)
            throw new Error(`Command ${command} does not exists.`);

        // Running
        this.commands[command].run().then(() => {

            console.info(`Command ${command} finished.`);

        }).catch((e) => {

            console.error(`Error during execution of ${command}:`, e);

        }).finally(() => {

            process.exit();

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
            const wrappedCommand =  `bash -c '${fullCommand}; echo "Entrée pour continuer"; read a;'`;
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

                resolve();
            })

        });
        
    }

}

export default new CLI()