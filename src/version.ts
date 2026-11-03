declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;

export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
export const BUILD_TIME = typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : '';

export const versionLabel = () =>
  `Version ${APP_VERSION}${BUILD_TIME ? ` · built ${new Date(BUILD_TIME).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}` : ''}`;
