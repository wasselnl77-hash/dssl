/* The engine puts itself on window as DSSL. Typed once, here, so the site and its
 * tests agree on what exists. Anything the site does not call is left loose. */

interface DsslError { file?: string; line?: number; message: string; hint?: string }
interface DsslApplyResult {
  ok: boolean;
  errors: DsslError[];
  warnings?: DsslError[];
  stats: { rules: number; shadowRules: number; motions: number; tokens: number; mediaQueries: number };
}

interface Window {
  DSSL?: {
    version: string;
    load: (urls: string[], opts?: { reset?: boolean }) => Promise<unknown>;
    apply: (src: string, opts?: { name?: string; scope?: string | Element; replace?: boolean }) => DsslApplyResult;
    compile?: (src: string) => DsslApplyResult;
    signal: (name: string, value: string | null) => void;
    getSignal?: (name: string) => string | undefined;
    replay: (selector?: string) => void;
    refresh: () => void;
    freeze: () => unknown;
    unfreeze: () => unknown;
    explain: (el: Element, opts?: { quiet?: boolean }) => unknown;
    errors: () => DsslError[];
    toCSS?: (src: string) => { css: string; report: unknown };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    __debug?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [extra: string]: any;
  };
}
