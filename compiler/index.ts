/*----------------------------------
- DEPENDANCES
----------------------------------*/

// Npm
import path from 'path';
import webpack from 'webpack';
import fs from 'fs-extra';
import serialize from 'serialize-javascript';

import SpeedMeasurePlugin from "speed-measure-webpack-plugin";
const smp = new SpeedMeasurePlugin({ disable: true });

// Core
import app from '../app';
import cli from '..';
import createServerConfig from './server';
import createClientConfig from './client';
import { TCompileMode } from './common';

type TCompilerCallback = (compiler: webpack.Compiler) => void

type TServiceMetas = {
    id: string, 
    name: string, 
    parent: string, 
    dependences: string, 
    importationPath: string
}

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

        const blacklist = ['node_modules', '5htp-core', '5htp']
        const files: string[] = [];
        const dirents = fs.readdirSync(dir, { withFileTypes: true });

        for (let dirent of dirents) {

            let fileName = dirent.name;
            let filePath = path.resolve(dir, fileName);

            if (blacklist.includes( fileName ))
                continue;

            // Define is we should recursively find service in the current item
            let iterate: boolean = false;
            if (dirent.isSymbolicLink()) {

                const realPath = path.resolve( dir, fs.readlinkSync(filePath) );
                const destinationInfos = fs.lstatSync( realPath );
                if (destinationInfos.isDirectory())
                    iterate = true;

            } else if (dirent.isDirectory())
                iterate = true;

            // Update the list of found services
            if (iterate) {
                files.push( ...this.findServices(filePath) );
            } else if (dirent.name === 'service.json') {
                files.push( path.dirname(filePath) );
            }
        }
        return files;
    }

    private indexServices() {
        

        // Index services
        const searchDirs = {
            // The less priority is the first
            // The last override the first if there are duplicates
            '@server/services/': path.join(cli.paths.core.root, 'server', 'services'),
            '@/server/services/': path.join(app.paths.root, 'server', 'services'),
            // Temp disabled because compile issue on vercel
            //'': path.join(app.paths.root, 'node_modules'),
        }

        // Generate app class file
        const servicesAvailable: {[id: string]: TServiceMetas} = {};
        for (const importationPrefix in searchDirs) {

            const searchDir = searchDirs[ importationPrefix ];
            const services = this.findServices(searchDir);

            for (const serviceDir of services) {
                const metasFile = path.join( serviceDir, 'service.json');

                // The +1 is to remove the slash
                const importationPath = importationPrefix + serviceDir.substring( searchDir.length + 1 );

                const serviceMetas = require(metasFile);

                servicesAvailable[ serviceMetas.id ] = {
                    ...serviceMetas,
                    importationPath
                };
            }
        }

        // Read app services
        const imported: string[] = []
        const referencedNames: {[serviceId: string]: string} = {} // ID to Name

        const refService = (serviceName: string, serviceConfig: any, level: number = 0) => {

            if (serviceConfig.refTo !== undefined) {
                const refTo = serviceConfig.refTo;
                return {
                    name: serviceName,
                    code: `${serviceName}: this.${refTo},`,
                    priority: 0
                }
            }

            const serviceMetas = servicesAvailable[ serviceConfig.id ];
            if (serviceMetas === undefined)
                throw new Error(`Service ${serviceConfig.id} not found. Referenced services: ${Object.keys(servicesAvailable).join('\n')}`);

            const referencedName = referencedNames[serviceConfig.id];
            if (referencedName !== undefined)
                throw new Error(`Service ${serviceConfig.id} is already setup as ${referencedName}`);
            
            // Generate index & typings
            imported.push(`import ${serviceMetas.name} from "${serviceMetas.importationPath}";`);

            if (serviceConfig.name !== undefined)
                referencedNames[serviceConfig.id] = serviceConfig.name;

            // Subservices
            let subservices = '';
            if (serviceConfig.subservices) {

                const subservicesList = serviceConfig.subservices;
                const subservicesCode = Object.entries(subservicesList).map(([name, service]) => 
                    refService(name, service, level + 1) 
                );

                // Sort by priority
                const sortedSubservices = subservicesCode.sort((a, b) => a.priority - b.priority);

                // Generate code
                subservices = sortedSubservices.map(s => s.code).join('\n');
            }

            // Generate the service instance
            const instanciation = `new ${serviceMetas.name}( 
                this, 
                ${serialize(serviceConfig.config || {}) || '{}'}, 
                () => ({
                    ${subservices}
                }), 
                this 
            )`

            if (level === 0)
                return {
                    name: serviceName,
                    code: `public ${serviceName} = ${instanciation};`,
                    priority: serviceConfig.config?.priority || 0
                };
            else
                return {
                    name: serviceName,
                    code: `${serviceName}: ${instanciation},`,
                    priority: serviceConfig.config?.priority || 0
                };
        }

        const servicesCode = Object.values(app.registered).map( s => refService(s.name, s, 0));
        const sortedServices = servicesCode.sort((a, b) => a.priority - b.priority);
        
        const services = sortedServices.map(s => s.code).join('\n');
        const servicesNames = sortedServices.map(s => s.name);

        // Define the app class identifier
        const appClassIdentifier = app.identity.identifier;
        const containerServices = app.containerServices.map( s => "'" + s + "'").join('|');

        // Output the services index
        fs.outputFileSync(
            path.join( app.paths.client.generated, 'services.d.ts'),
`declare module "@app" {

    import { RouenEvents as RouenEventsClient } from "@/client";
    import RouenEventsServer from "@/server/.generated/app";
    
    import { ApplicationProperties as ClientApplicationProperties } from "@client/app";
    import { ApplicationProperties as ServerApplicationProperties } from "@server/app";

    type ClientServices = Omit<RouenEventsClient, ClientApplicationProperties>;
    type ServerServices = Omit<RouenEventsServer, ServerApplicationProperties | keyof ClientServices>;
  
    type CombinedServices = ClientServices & ServerServices;
  
    const appClass: CombinedServices;
    export = appClass;
}


// Temporary
/*declare module '@models' {
    export * from '@/var/prisma/index';
}*/
  
declare module '@models' {
    import { Prisma, PrismaClient } from '@/var/prisma/index';
  
    type ModelNames = Prisma.ModelName;
  
    type ModelDelegates = {
        [K in ModelNames]: PrismaClient[Uncapitalize<K>];
    };
  
    const models: ModelDelegates;
  
    export = models;
}
  `
        );

        fs.outputFileSync(
            path.join( app.paths.server.generated, 'app.ts'),
`import { Application } from '@server/app/index';

${imported.join('\n')}

export default class ${appClassIdentifier} extends Application {

    protected serviceNames = [
        ${Object.values(servicesNames).map(name => `"${name}"`).join(',\n')}
    ] as const;

    protected servicesIdToName = {
        ${Object.entries(referencedNames).map(([id, name]) => `"${id}": "${name}"`).join(',\n')}
    } as const;

    ${services}
}


`);

        fs.outputFileSync(
            path.join( app.paths.server.generated, 'services.d.ts'),
`type InstalledServices = import('./services').Services;

declare type ${appClassIdentifier} = import("@/server/.generated/app").default;

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

    import { Application } from "@server/app";
    import { Environment } from "@server/app";
    import { ServicesContainer } from "@server/app/service/container";

    abstract class ApplicationWithServices extends Application<
        ServicesContainer<InstalledServices>
    > {}

    export interface Exported {
        Application: typeof ApplicationWithServices,
        Environment: Environment,
    }

    const foo: Exported;

    export = foo;
}
    
declare module '@models' {
    import { Prisma, PrismaClient } from '@/var/prisma/index';
  
    type ModelNames = Prisma.ModelName;
  
    type ModelDelegates = {
      [K in ModelNames]: PrismaClient[Uncapitalize<K>];
    };
  
    const models: ModelDelegates;
  
    export = models;
}`
        );
    }

    public async create() {

        await app.warmup();

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

            compiler.hooks.compile.tap(name, (compilation) => {
                
                this.callbacks.before && this.callbacks.before( compiler );

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