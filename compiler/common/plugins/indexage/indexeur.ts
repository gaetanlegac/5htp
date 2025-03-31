type DonneesAenregistrer = { fichier: string, donnees: string }

export default abstract class Indexeur {

    public compile = {};
    public derniereMaj = 0; 
    public derniereModif = 0;

    public abstract Init(): void;
    public abstract Maj( donneesMetas: any, fichier: string ): boolean;
    public abstract Enregistrer(): Promise< DonneesAenregistrer[] >;

}