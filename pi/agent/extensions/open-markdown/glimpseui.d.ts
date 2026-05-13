declare module "glimpseui" {
  export interface GlimpseWindow {
    on(event: "ready" | "message" | "info" | "closed", handler: (...args: any[]) => void): void;
    send(script: string): void;
    setHTML(html: string): void;
    getInfo(): void;
    close(): void;
    info?: unknown;
  }

  export interface GlimpseOptions {
    width?: number;
    height?: number;
    title?: string;
    frameless?: boolean;
    floating?: boolean;
    transparent?: boolean;
    clickThrough?: boolean;
    followCursor?: boolean;
    followMode?: "snap" | "spring";
    cursorAnchor?: string;
    cursorOffset?: { x: number; y: number };
    openLinks?: boolean;
    openLinksApp?: string;
    autoClose?: boolean;
    noDock?: boolean;
    x?: number;
    y?: number;
    timeout?: number;
  }

  export function open(html: string, options?: GlimpseOptions): GlimpseWindow;
}
