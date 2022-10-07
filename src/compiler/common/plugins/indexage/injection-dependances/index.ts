/*----------------------------------
- DEPENDANCES
----------------------------------*/

// Npm
import fs from 'fs-extra';

// Libs
import Indexeur from '../indexeur';
import Stringify from '../_utils/Stringify';
import cli from '@cli';

const fichierSortie = cli.paths.app.cache + '/serveur/services.ts';

/*----------------------------------
- TYPES
----------------------------------*/
type TService = {
    classe?: any,
    dependances: string[]
}

type TListeServices = {[idService: string]: TService};

/*----------------------------------
- PLUGIN
----------------------------------*/
export default class SelecteursApi extends Indexeur {

    private dependances: TListeServices = {};

    /*----------------------------------
    - EVENTS
    ----------------------------------*/
    public Init() {

        // Autrement, erreur compilation comme quoi que le module n'existe pas
        // En effet, le dossier cache est vidé avant la compilation
        // Et le fichierd'index des déps n'est généré qu'à la fin de la compilation
        fs.outputFileSync(fichierSortie, 'export default {}');
        
    }

    public Maj(nouveauxServices: TListeServices, fichier: string): boolean {

        let maj = false;

        for (const idService in nouveauxServices) {

            maj = true;

            this.dependances[idService] = nouveauxServices[idService];

        }

        return maj;
    }

    public async Enregistrer() {

        console.log('enregistrer dépendances', this.dependances);

        fs.outputFileSync(fichierSortie, 'export default ' + Stringify(this.dependances, ['classe']));

        return [];
    
    }
}