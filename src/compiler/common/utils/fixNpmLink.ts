/*----------------------------------
- DEPENDANCES
----------------------------------*/

// Npm
import path from 'path';
import fs from 'fs-extra';

// App
import type App from '../../../app';

/*----------------------------------
- TYPES
----------------------------------*/

/*----------------------------------
- UTTILS
----------------------------------*/
export const fixNpmLinkIssues = ( app: App ) => {

    const corePath = path.join(app.paths.root, '/node_modules/5htp-core');
    if (!fs.lstatSync( corePath ).isSymbolicLink())
        return console.info("Not fixing npm issue because 5htp-core wasn't installed with npm link.");

    console.info(`Fix NPM link issues ...`);

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