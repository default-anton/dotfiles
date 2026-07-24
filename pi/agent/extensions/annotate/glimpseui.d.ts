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

  export interface GlimpseWindow {
    on(event: "message", listener: (data: unknown) => void): this;
    once(event: "closed", listener: () => void): this;
    once(event: "error", listener: (error: Error) => void): this;
    close(): void;
  }

  export function open(
    html: string,
    options?: GlimpseOptions,
  ): GlimpseWindow;

  export function prompt<T = unknown>(
    html: string,
    options?: GlimpseOptions,
  ): Promise<T | null>;
}
