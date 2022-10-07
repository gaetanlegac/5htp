/*----------------------------------
- DEPENDANCES
----------------------------------*/
import fs from 'fs-extra';

/*----------------------------------
- TYPE
----------------------------------*/
type TDonnees = {[cle: string]: string | number};

/*----------------------------------
- FONCTION
----------------------------------*/
export default function lireAnnotations<TRetour = TDonnees>( fichier: string ): TRetour | undefined {

    let annotations: TRetour = {} as TRetour;
    let lectureAnnotations: boolean = false;

    // Lecture de chaque ligne
    const lignes = fs.readFileSync(fichier, 'utf-8').split('\n');
    for (let ligne of lignes) {

        // Debut des annotations
        if (ligne === "/* ~~~~~~~~~~~~~~~~") {

            lectureAnnotations = true;

        // Fin des anotations
        } else if (ligne === "~~~~~~~~~~~~~~~~ */") {

            return annotations;

        // Lecture des annotations
        } else if (lectureAnnotations) {

            // Retire le "* " au debut de la ligne
            ligne = ligne.substring(2).trim();
            // Ligne vide
            if (ligne.length === 0)
                continue;

            // Niveau indentation
            //const indentation = ligne.match(/^( )*/)
            //const indentLevel = indentation === null ? 0 : indentation[0].length;
            
            // cle: valeur
            if (ligne.includes(': ')) {

                // Décomposition clé / valeur
                let [cle, valeur] = ligne.split(': ') as [string, any];
                cle = cle.trim().toLowerCase();

                // retire le commentaire
                const poscommentaire = valeur.indexOf(' //')
                if (poscommentaire !== -1)
                    valeur = valeur.substring(0, poscommentaire);
                valeur = valeur.trim();

                // Met en minuscules
                if (cle) {

                    // Correction type valeur
                    if (valeur === 'true')
                        valeur = true;
                    else if (valeur === 'false')
                        valeur = false;
                    else if (!isNaN(Number(valeur)))
                        valeur = parseFloat(valeur);

                    // Référencement
                    if (annotations[cle] === undefined)
                        annotations[cle] = valeur;
                    // Valeur déjà existante, regroupement dans un tableau
                    else if (!Array.isArray(annotations[cle]))
                        annotations[cle] = [annotations[cle], valeur];
                    // Déjà en tableau, ajout élement
                    else
                        annotations[cle] = [...annotations[cle], valeur];

                }

            }
        }

    }

    return undefined;
}