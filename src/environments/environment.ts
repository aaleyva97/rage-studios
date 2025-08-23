export const environment = {
  production: true,
  baseUrl: 'https://ragestudios.mx',
  SUPABASE_URL: 'https://qixgxmlpmploaataidnv.supabase.co',
  SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpeGd4bWxwbXBsb2FhdGFpZG52Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyOTExODMsImV4cCI6MjA3MDg2NzE4M30.ItBAlRYQuXTIkihyXejTwSfUTephNOwspseuoMcWpgU',
  STRIPE_PUBLISHABLE_KEY: process.env['NG_APP_STRIPE_PUBLISHABLE_KEY'] || ''
};
