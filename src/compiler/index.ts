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
import app from '../app';
import cli from '..';
import createServerConfig from './server';
import createClientConfig from './client';
import { TCompileMode } from './common';

type TCompilerCallback = () => void

/*----------------------------------
- FONCTION
----------------------------------*/
export default class Compiler {

    public compiling: { [compiler: string]: Promise<void> } = {};     

    public constructor(
        private mode: TCompileMode,
        private callbacks: {
            before?: TCompilerCallback,
            after?: TCompilerCallback,
        } = {},
        private debug: boolean = false
    ) {

    }

    public cleanup() {

        fs.emptyDirSync( app.paths.bin );
        fs.ensureDirSync( path.join(app.paths.bin, 'public') )
        const publicFiles = fs.readdirSync(app.paths.public);
        for (const publicFile of publicFiles) {
            // Dev: faster to use symlink
            if (this.mode === 'dev')
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
    }
    /* FIX issue with npm link
        When we install a module with npm link, this module's deps are not installed in the parent project scope
        Which causes some issues:
        - The module's deps are not found by Typescript
        - Including React, so VSCode shows that JSX is missing
    */
    public fixNpmLinkIssues() {
        const corePath = path.join(app.paths.root, '/node_modules/5htp-core');
        if (!fs.lstatSync( corePath ).isSymbolicLink())
            return console.info("Not fixing npm issue because 5htp-core wasn't installed with npm link.");

        this.debug && console.info(`Fix NPM link issues ...`);

        const appModules = path.join(app.paths.root, 'node_modules');
        const coreModules = path.join(corePath, 'node_modules');

        // When the 5htp package is installed from npm link,
        // Modules are installed locally and not glbally as with with the 5htp package from NPM.
        // So we need to symbilnk the http-core node_modules in one of the parents of server.js.
        // It avoids errors like: "Error: Cannot find module 'intl'"
        fs.symlinkSync( coreModules, path.join(app.paths.bin, 'node_modules') );

        // Same problem: when 5htp-core is installed via npm link, 
        // Typescript doesn't detect React and shows mission JSX errors
        const preactCoreModule = path.join(coreModules, 'preact');
        const preactAppModule = path.join(appModules, 'preact');
        const reactAppModule = path.join(appModules, 'react');

        if (!fs.existsSync( preactAppModule ))
            fs.symlinkSync( preactCoreModule, preactAppModule );
        if (!fs.existsSync( reactAppModule ))
            fs.symlinkSync( path.join(preactCoreModule, 'compat'), reactAppModule );
    }

    private findServices( dir: string ) {
        const files: string[] = [];
        const dirents = fs.readdirSync(dir, { withFileTypes: true });
        for (const dirent of dirents) {
            const res = path.resolve(dir, dirent.name);
            if (dirent.isDirectory()) {
                files.push( ...this.findServices(res) );
            } else if (dirent.name === 'service.json') {
                files.push( path.dirname(res) );
            }
        }
        return files;
    }

    private indexServices() {
        
        const imported: string[] = []
        const exportedType: string[] = []
        const exportedMetas: string[] = []

        // Index services
        const searchDirs = {
            '@server/services': path.join(cli.paths.core.src, 'server', 'services'),
            '@/server/services': path.join(app.paths.src, 'server', 'services'),
            // TODO: node_modules
        }

        for (const importationPrefix in searchDirs) {

            const searchDir = searchDirs[ importationPrefix ];
            const services = this.findServices(searchDir);

            for (const serviceDir of services) {

                const metasFile = path.join( serviceDir, 'service.json');
                const { id, name, parent, dependences } = require(metasFile);

                const importationPath = importationPrefix + serviceDir.substring( searchDir.length );
                
                // Generate index & typings
                imported.push(`import type ${name} from "${importationPath}";`);
                exportedType.push(`'${id}': ${name},`);
                // NOTE: only import enabled packages to optimize memory
                // TODO: don't index non-setuped packages in the exported metas
                exportedMetas.push(`'${id}': {
class: () => require("${importationPath}"),
id: "${id}",
name: "${name}",
parent: "${parent}",
dependences: ${JSON.stringify(dependences)},
                },`);
            }
        }

        // Define the app class identifier
        const appClassIdentifier = app.identity.identifier;
        const containerServices = app.containerServices.map( s => "'" + s + "'").join('|');

        // Output the services index
        fs.outputFileSync(
            path.join( app.paths.client.generated, 'services.d.ts'),
`declare module "@app" {

    import ${appClassIdentifier} from '@/client/index';

    const appClass: ${appClassIdentifier};

    export = appClass
}`
        );

        fs.outputFileSync(
            path.join( app.paths.server.generated, 'services.ts'),
`${imported.join('\n')}
export type Services = {
    ${exportedType.join('\n')}
}
export default {
    ${exportedMetas.join('\n')}
}`
        );

        fs.outputFileSync(
            path.join( app.paths.server.generated, 'services.d.ts'),
`type InstalledServices = import('./services').Services;

declare type ${appClassIdentifier} = import("@/server").default;

declare module "@app" {

    import { ApplicationContainer } from '@server/app/container';

    const ServerServices: (
        Pick< 
            ApplicationContainer<InstalledServices>, 
            ${containerServices}
        >
        & 
        ${appClassIdentifier}
    )

    export = ServerServices
}

declare module '@server/app' {

    import { Application } from "@server/app/index";
    import { ServicesContainer } from "@server/app/service/container";

    abstract class ApplicationWithServices extends Application<
        ServicesContainer<InstalledServices>
    > {}

    export interface Exported {
        Application: typeof ApplicationWithServices,
        Services: ServicesContainer<InstalledServices>,
    }

    const foo: Exported;

    export = foo;
}`
        );
    }

    public async create() {

        this.cleanup();

        this.fixNpmLinkIssues();

        this.indexServices();

        // Create compilers
        const multiCompiler = webpack([
            smp.wrap( createServerConfig(app, this.mode) ),
            smp.wrap( createClientConfig(app, this.mode) )
        ]);

        for (const compiler of multiCompiler.compilers) {

            const name = compiler.name;
            if (name === undefined)
                throw new Error(`A name must be specified to each compiler.`);

            let timeStart = new Date();

            let finished: (() => void);
            this.compiling[name] = new Promise((resolve) => finished = resolve);

            compiler.hooks.compile.tap(name, () => {

                this.callbacks.before && this.callbacks.before();

                this.compiling[name] = new Promise((resolve) => finished = resolve);

                timeStart = new Date();
                console.info(`[${name}] Compiling ...`);
            });

            /* TODO: Ne pas résoudre la promise tant que la recompilation des données indexées (icones, identité, ...) 
                n'a pas été achevée */
            compiler.hooks.done.tap(name, stats => {

                // Shiow status
                const timeEnd = new Date();
                const time = timeEnd.getTime() - timeStart.getTime();
                if (stats.hasErrors()) {

                    console.info(stats.toString(compiler.options.stats));
                    console.error(`[${name}] Failed to compile after ${time} ms`);

                    // Exit process with code 0, so the CI container can understand building failed
                    // Only in prod, because in dev, we want the compiler watcher continue running
                    if (this.mode === 'prod')
                        process.exit(0);

                } else {
                    this.debug && console.info(stats.toString(compiler.options.stats));
                    console.info(`[${name}] Finished compilation after ${time} ms`);
                }

                // Mark as finished
                finished();
                delete this.compiling[name];
            });
        }

        return multiCompiler;

    }

}