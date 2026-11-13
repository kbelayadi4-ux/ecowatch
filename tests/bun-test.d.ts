/**
 * Déclaration minimale du module `bun:test`, absent de node_modules.
 * Elle suffit à typer les fichiers de `tests/` sans ajouter de dépendance.
 */
declare module "bun:test" {
  export type FonctionTest = () => void | Promise<void>;

  export function describe(nom: string, corps: () => void): void;
  export function test(nom: string, corps: FonctionTest): void;

  interface Attendu {
    toBe(valeur: unknown): void;
    toBeNull(): void;
    toBeUndefined(): void;
    toEqual(valeur: unknown): void;
    not: Pick<Attendu, "toBe" | "toBeNull" | "toBeUndefined" | "toEqual">;
  }

  export function expect(valeur: unknown): Attendu;
}