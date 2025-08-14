declare module '*.css' {
    const content: string;
    export default content;
  }
  
  declare module '*.scss' {
    const content: string;
    export default content;
  }

  // Image file declarations
  declare module '*.png' {
    const value: string;
    export default value;
  }

  declare module '*.jpg' {
    const value: string;
    export default value;
  }

  declare module '*.jpeg' {
    const value: string;
    export default value;
  }

  declare module '*.gif' {
    const value: string;
    export default value;
  }

  declare module '*.svg' {
    const value: string;
    export default value;
  }
  
  // VS Code webview API
  interface VsCodeApi<T = any> {
    postMessage(message: any): void;
    setState(state: T): void;
    getState(): T | undefined;
}

declare function acquireVsCodeApi<T = unknown>(): VsCodeApi<T>;

// Add csp property to React's iframe attributes
declare namespace React {
  interface IframeHTMLAttributes<T> {
    csp?: string;
  }
}