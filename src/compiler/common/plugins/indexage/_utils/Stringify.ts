const placeholder: string = '____PLACEHOLDER____';
const balises = {
    fonction: '[fonction]',
    methode: '[methode]'
}

const regRemplacements = new RegExp('("([^"]+)": )?"' + placeholder + '"', 'g');

// Permet de transformer un objet en chaine json sans niquer les fonctions
export default ( obj: object, fonctions: string[] = [] ): string => {

    var fns: [string, string][] = [];

    // Remplace les fonctions par un placeholder et tranforme en json
    var json = JSON.stringify(obj, (key: string, value: any): string => {

        const func: boolean = typeof value === 'function';
        const ref_fonction: boolean = typeof value === 'string' && value.startsWith( balises.fonction );
        const ref_methode: boolean = typeof value === 'string' && value.startsWith( balises.methode );

        if (fonctions.includes(key) || func || ref_fonction || ref_methode) {

            if (func)
                value = value.toString();
            else if (ref_fonction)
                value = value.substring( balises.fonction.length );
            else if (ref_methode)
                value = value.substring( balises.methode.length );

            fns.push([ value, ref_methode ? 'methode' : 'fonction' ]);

            return placeholder;
        }

        return value;
    }, 4);

    // Remplace les placeholders par la fonction brute sans les guillemets
    json = json.replace(regRemplacements, (match: string, contnom: string, nom: string): string => {
        const func = fns.shift();
        if (Array.isArray(func)) {

            const [ fonction, type ] = func;

            // La fonction est dans un tableau
            if (nom === undefined)
                return fonction;
            else
                return type === 'methode'
                    // nom() { ... }
                    ? nom + fonction
                    // "nom": () => { ... }
                    : '"'+ nom +'": ' + fonction;

            return fonction ? fonction : '';

        } else
            return '';
    });

    // retire les quotes
    json = json.replace(/\"([a-zA-Z]+)\"\:/gm, '$1:');

    // Correction pour les méthodes de classe
    // Remplace <nom>: <args> => { par <nom><args> {
    json = json.replace(
        /([a-zA-Z]+)\:\s*(\([a-zA-Z\,\s]*\))\s*\=\>\s*\{/gmi,
        '$1$2 {'
    );

    return json;
};
