export const environment = {
    production: false,
    baseUrl: 'http://localhost:4200',
    SUPABASE_URL: 'https://qixgxmlpmploaataidnv.supabase.co',
    SUPABASE_KEY:'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpeGd4bWxwbXBsb2FhdGFpZG52Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyOTExODMsImV4cCI6MjA3MDg2NzE4M30.ItBAlRYQuXTIkihyXejTwSfUTephNOwspseuoMcWpgU',
    STRIPE_PUBLISHABLE_KEY: 'pk_test_51RddNtFYW1YEJonjrthGWYTIddC3zIR82a7I8jHVtaUmYTELfR0CrESBDTnhOQqvn9lrvlbLSbdgDaBVDH9oBzVx00H2AH0a8O',

     serviceWorker: {
    enabled: true,
    script: 'firebase-messaging-sw.js',
    registrationStrategy: 'registerImmediately',
    scope: '/',
    updateViaCache: 'none' as 'none' 
  }
};
