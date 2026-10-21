/** Set at build time from admin/.env. Keep APP_NAME the same as the web app's. */
export const APP_NAME = process.env.APP_NAME || 'Scanaar';
/** The public web app, for links to store pages and the owners' dashboard. */
export const WEB_URL = (process.env.WEB_URL || 'http://localhost:3000').replace(/\/$/, '');
