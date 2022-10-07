/*----------------------------------
- DEPENDANCES
----------------------------------*/

// Npm
import fs from 'fs-extra';
import prompts from 'prompts';

// Core
import cli from '../..';
import { api } from '../utils';

0/*----------------------------------
- HELPERS
----------------------------------*/

const mergeDeps = ({ dependencies: coreDeps }, { dependencies: appDeps }) => {
    for (const dep in appDeps)
        if (dep in coreDeps) {

            if (coreDeps[dep] !== appDeps[dep])
                throw new Error(`Duplicate dependency "${dep}" with different version in core (${coreDeps[dep]}) and app (${appDeps[dep]})`);
            else
                console.warn(`Duplicate dependency "${dep}" in core and app`);

        } else
            coreDeps[dep] = appDeps[dep];
    return coreDeps;
}

const toast = (type: string, title: string, content: string) =>
    api('POST', '/admin/api/notification', { type, title, content }, true)

/*----------------------------------
- COMMAND
----------------------------------*/
export async function run() {

    const { simulate } = cli.args;

    const temp = cli.paths.app.root + '/.deployment';
    fs.emptyDirSync(temp);

    // Merge package.json: framework + app
    const appPkg = fs.readJSONSync(cli.paths.app.root + '/package.json');
    const corePkg = fs.readJSONSync(cli.paths.core.root + '/package.json');
    fs.outputJSONSync(temp + '/package.json', {
        ...appPkg,
        dependencies: mergeDeps(corePkg, appPkg),
        devDependencies: {}
    }, { spaces: 4 });

    // Copy config file
    fs.copyFileSync( cli.paths.app.root + (simulate ? '/env.yaml' : '/env.server.yaml'), temp + '/env.yaml' );

    // Compile & Run Docker
    await cli.shell(`docker compose up --build`);
    toast("info", "Server update", "A server update will start. You might experience some temporary slowdowns.")

    fs.removeSync(temp);

}