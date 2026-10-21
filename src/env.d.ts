declare const process: { env: { APP_NAME?: string; WEB_URL?: string } };

declare module '*.jpg' {
  const src: string;
  export default src;
}
declare module '*.css';
