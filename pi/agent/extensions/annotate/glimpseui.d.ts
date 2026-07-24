declare module "glimpseui" {
  export interface GlimpseOptions {
    width?: number;
    height?: number;
    title?: string;
    x?: number;
    y?: number;
    frameless?: boolean;
    floating?: boolean;
    transparent?: boolean;
    clickThrough?: boolean;
    noDock?: boolean;
    hidden?: boolean;
    autoClose?: boolean;
    openLinks?: boolean;
    openLinksApp?: string;
    timeout?: number;
  }

  export function prompt<T = unknown>(
    html: string,
    options?: GlimpseOptions,
  ): Promise<T | null>;
}
