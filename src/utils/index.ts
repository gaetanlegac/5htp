/*----------------------------------
- DEPENDANCES
----------------------------------*/

// Npm
import fs from 'fs-extra';
import path from 'path';


/*----------------------------------
- TYPES
----------------------------------*/


/*----------------------------------
- UTILS
----------------------------------*/

export const api = (method: string, path: string, data: object, local: boolean = false) =>
    `curl -X ${method} ${local ? 'http://localhost:3010' : 'https://dopamyn.io'}${path} ` +
    `-H 'Content-Type: application/json' -H 'Accept: application/json' ` +
    `-d '${JSON.stringify(data)}';`;